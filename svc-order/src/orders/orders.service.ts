import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '@soa/database';
import { ProductClientService } from '../common/product-client.service.js';
import type { CreateOrderDto } from './dto/create-order.dto.js';
import type { UpdateOrderStatusDto } from './dto/update-order-status.dto.js';

export interface OrderItemRecord extends Record<string, unknown> {
  id: number;
  order_id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface OrderRecord extends Record<string, unknown> {
  id: number;
  customer_name: string;
  customer_email: string;
  total_amount: number;
  status: 'pending' | 'completed' | 'cancelled';
  created_at: Date | string;
  updated_at: Date | string;
  items?: OrderItemRecord[];
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly productClientService: ProductClientService,
  ) {}

  /**
   * Lấy danh sách tất cả các đơn hàng, sắp xếp mới nhất lên đầu
   */
  async findAll(): Promise<OrderRecord[]> {
    const result = await this.databaseService.query<OrderRecord>(
      `SELECT id, customer_name, customer_email, 
              CAST(total_amount AS FLOAT) AS total_amount, 
              status, created_at, updated_at 
       FROM dbo.orders 
       ORDER BY id DESC`,
    );
    return result.recordset;
  }

  /**
   * Lấy thông tin chi tiết một đơn hàng theo ID kèm theo danh sách các mặt hàng (order_items)
   */
  async findOne(id: number): Promise<OrderRecord> {
    const orderResult = await this.databaseService.query<OrderRecord>(
      `SELECT id, customer_name, customer_email, 
              CAST(total_amount AS FLOAT) AS total_amount, 
              status, created_at, updated_at 
       FROM dbo.orders 
       WHERE id = @id`,
      { id },
    );

    const order = orderResult.recordset[0];
    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn hàng với ID ${id}`);
    }

    // Lấy các mặt hàng thuộc đơn hàng này
    const itemsResult = await this.databaseService.query<OrderItemRecord>(
      `SELECT id, order_id, product_id, product_name, quantity, 
              CAST(unit_price AS FLOAT) AS unit_price, 
              CAST(total_price AS FLOAT) AS total_price 
       FROM dbo.order_items 
       WHERE order_id = @id 
       ORDER BY id ASC`,
      { id },
    );

    order.items = itemsResult.recordset;
    return order;
  }

  /**
   * Tạo đơn hàng mới:
   * 1. Gọi svc-product để lấy thông tin giá và kiểm tra số lượng tồn kho của từng mặt hàng.
   * 2. Tính toán tổng tiền từng mặt hàng và tổng tiền đơn hàng.
   * 3. Lưu orders và order_items trong MỘT transaction duy nhất với trạng thái 'pending'.
   */
  async create(dto: CreateOrderDto, authHeader: string): Promise<OrderRecord> {
    // Tổng hợp số lượng yêu cầu theo từng product_id (tránh trường hợp client gửi trùng product_id nhiều lần)
    const quantityMap = new Map<number, number>();
    for (const item of dto.items) {
      quantityMap.set(
        item.product_id,
        (quantityMap.get(item.product_id) ?? 0) + item.quantity,
      );
    }

    // Lấy thông tin và kiểm tra tồn kho từ svc-product
    const productCache = new Map<number, { name: string; price: number; quantity: number }>();
    for (const [productId, requestedQty] of quantityMap.entries()) {
      const product = await this.productClientService.getProduct(productId, authHeader);

      // Nghiệp vụ: Kiểm tra tồn kho (Báo lỗi 409 Conflict nếu thiếu hàng)
      if (product.quantity < requestedQty) {
        throw new ConflictException(
          `Sản phẩm "${product.name}" (ID: ${productId}) không đủ tồn kho. Tồn kho hiện có: ${product.quantity}, số lượng yêu cầu: ${requestedQty}`,
        );
      }

      productCache.set(productId, {
        name: product.name,
        price: Number(product.price),
        quantity: product.quantity,
      });
    }

    // Xây dựng danh sách items hợp lệ với tên và đơn giá lấy TRỰC TIẾP từ svc-product (không tin client)
    let totalOrderAmount = 0;
    const resolvedItems = dto.items.map((item) => {
      const prod = productCache.get(item.product_id)!;
      const unitPrice = prod.price;
      const totalPrice = Number((unitPrice * item.quantity).toFixed(2));
      totalOrderAmount = Number((totalOrderAmount + totalPrice).toFixed(2));

      return {
        product_id: item.product_id,
        product_name: prod.name,
        quantity: item.quantity,
        unit_price: unitPrice,
        total_price: totalPrice,
      };
    });

    // Thực hiện lưu orders và order_items trong MỘT transaction duy nhất trong SQL Server
    const queryParams: Record<string, unknown> = {
      customer_name: dto.customer_name,
      customer_email: dto.customer_email,
      total_amount: totalOrderAmount.toFixed(2),
    };

    const valueRows: string[] = [];
    resolvedItems.forEach((item, index) => {
      queryParams[`p_id_${index}`] = item.product_id;
      queryParams[`p_name_${index}`] = item.product_name;
      queryParams[`p_qty_${index}`] = item.quantity;
      queryParams[`p_price_${index}`] = item.unit_price.toFixed(2);
      queryParams[`p_total_${index}`] = item.total_price.toFixed(2);

      valueRows.push(
        `(@new_order_id, @p_id_${index}, @p_name_${index}, @p_qty_${index}, CAST(@p_price_${index} AS DECIMAL(10,2)), CAST(@p_total_${index} AS DECIMAL(10,2)) )`,
      );
    });

    const transactionQuery = `
      BEGIN TRANSACTION;
      BEGIN TRY
        DECLARE @new_order_id INT;

        INSERT INTO dbo.orders (customer_name, customer_email, total_amount, status, created_at, updated_at)
        VALUES (@customer_name, @customer_email, CAST(@total_amount AS DECIMAL(10,2)), 'pending', SYSDATETIME(), SYSDATETIME());

        SET @new_order_id = SCOPE_IDENTITY();

        INSERT INTO dbo.order_items (order_id, product_id, product_name, quantity, unit_price, total_price)
        VALUES 
        ${valueRows.join(',\n')};

        COMMIT TRANSACTION;

        SELECT id, customer_name, customer_email, 
               CAST(total_amount AS FLOAT) AS total_amount, 
               status, created_at, updated_at
        FROM dbo.orders 
        WHERE id = @new_order_id;
      END TRY
      BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
      END CATCH
    `;

    const result = await this.databaseService.query<OrderRecord>(
      transactionQuery,
      queryParams,
    );

    const createdOrder = result.recordset[0];
    return this.findOne(createdOrder.id);
  }

  /**
   * Cập nhật trạng thái đơn hàng (chỉ cho phép pending, completed, cancelled)
   * Không cho phép đổi trạng thái từ completed hoặc cancelled về pending.
   */
  async updateStatus(id: number, dto: UpdateOrderStatusDto): Promise<OrderRecord> {
    const existingResult = await this.databaseService.query<{ id: number; status: string }>(
      'SELECT id, status FROM dbo.orders WHERE id = @id',
      { id },
    );

    const existing = existingResult.recordset[0];
    if (!existing) {
      throw new NotFoundException(`Không tìm thấy đơn hàng với ID ${id}`);
    }

    // Nghiệp vụ: Ràng buộc chuyển đổi trạng thái
    if (
      (existing.status === 'completed' || existing.status === 'cancelled') &&
      dto.status === 'pending'
    ) {
      throw new BadRequestException(
        `Không thể chuyển trạng thái đơn hàng từ "${existing.status}" về "pending"`,
      );
    }

    await this.databaseService.query(
      `UPDATE dbo.orders 
       SET status = @status, updated_at = SYSDATETIME() 
       WHERE id = @id`,
      { id, status: dto.status },
    );

    return this.findOne(id);
  }

  /**
   * Xóa một đơn hàng (Cascade tự động xóa các order_items nhờ FK ON DELETE CASCADE)
   */
  async remove(id: number): Promise<{ message: string }> {
    const existingResult = await this.databaseService.query<{ id: number }>(
      'SELECT id FROM dbo.orders WHERE id = @id',
      { id },
    );

    if (!existingResult.recordset[0]) {
      throw new NotFoundException(`Không tìm thấy đơn hàng với ID ${id}`);
    }

    await this.databaseService.query('DELETE FROM dbo.orders WHERE id = @id', { id });
    return { message: 'Đơn hàng đã được xóa thành công' };
  }
}
