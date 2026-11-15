import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '@soa/database';
import { ProductClientService } from '../common/product-client.service.js';
import type { OrderItemRecord } from '../orders/orders.service.js';
import type { CreateOrderItemDto } from './dto/create-order-item.dto.js';
import type { UpdateOrderItemDto } from './dto/update-order-item.dto.js';

@Injectable()
export class OrderItemsService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly productClientService: ProductClientService,
  ) {}

  /**
   * Lấy danh sách tất cả các mặt hàng trong tất cả đơn hàng
   */
  async findAll(): Promise<OrderItemRecord[]> {
    const result = await this.databaseService.query<OrderItemRecord>(
      `SELECT id, order_id, product_id, product_name, quantity, 
              CAST(unit_price AS FLOAT) AS unit_price, 
              CAST(total_price AS FLOAT) AS total_price 
       FROM dbo.order_items 
       ORDER BY id DESC`,
    );
    return result.recordset;
  }

  /**
   * Lấy chi tiết một mặt hàng theo ID
   */
  async findOne(id: number): Promise<OrderItemRecord> {
    const result = await this.databaseService.query<OrderItemRecord>(
      `SELECT id, order_id, product_id, product_name, quantity, 
              CAST(unit_price AS FLOAT) AS unit_price, 
              CAST(total_price AS FLOAT) AS total_price 
       FROM dbo.order_items 
       WHERE id = @id`,
      { id },
    );

    const item = result.recordset[0];
    if (!item) {
      throw new NotFoundException(`Không tìm thấy mặt hàng với ID ${id}`);
    }
    return item;
  }

  /**
   * Tạo mặt hàng mới trong đơn hàng:
   * 1. Kiểm tra đơn hàng cha tồn tại và đang ở trạng thái 'pending'.
   * 2. Gọi svc-product kiểm tra tồn kho và lấy giá bán hiện tại.
   * 3. Tính toán total_price của mặt hàng.
   * 4. Chèn mặt hàng và cập nhật lại total_amount, updated_at của đơn hàng cha trong transaction.
   */
  async create(
    dto: CreateOrderItemDto,
    authHeader: string,
  ): Promise<OrderItemRecord> {
    const orderResult = await this.databaseService.query<{
      id: number;
      status: string;
    }>('SELECT id, status FROM dbo.orders WHERE id = @order_id', {
      order_id: dto.order_id,
    });

    const parentOrder = orderResult.recordset[0];
    if (!parentOrder) {
      throw new NotFoundException(
        `Đơn hàng cha với ID ${dto.order_id} không tồn tại`,
      );
    }

    if (parentOrder.status !== 'pending') {
      throw new BadRequestException(
        `Không thể thêm mặt hàng vào đơn hàng có trạng thái "${parentOrder.status}". Chỉ cho phép sửa đơn hàng "pending".`,
      );
    }

    // Kiểm tra tồn kho và lấy giá từ svc-product
    const product = await this.productClientService.getProduct(
      dto.product_id,
      authHeader,
    );

    if (product.quantity < dto.quantity) {
      throw new ConflictException(
        `Sản phẩm "${product.name}" (ID: ${dto.product_id}) không đủ tồn kho. Tồn kho hiện có: ${product.quantity}, yêu cầu: ${dto.quantity}`,
      );
    }

    const unitPrice = Number(product.price);
    const totalPrice = Number((unitPrice * dto.quantity).toFixed(2));

    const statement = `
      BEGIN TRANSACTION;
      BEGIN TRY
        DECLARE @new_item_id INT;

        INSERT INTO dbo.order_items (order_id, product_id, product_name, quantity, unit_price, total_price)
        VALUES (@order_id, @product_id, @product_name, @quantity, CAST(@unit_price AS DECIMAL(10,2)), CAST(@total_price AS DECIMAL(10,2)));

        SET @new_item_id = SCOPE_IDENTITY();

        -- Tự động tính toán lại tổng tiền total_amount của đơn hàng cha
        UPDATE dbo.orders
        SET total_amount = (
              SELECT COALESCE(SUM(total_price), 0) 
              FROM dbo.order_items 
              WHERE order_id = @order_id
            ),
            updated_at = SYSDATETIME()
        WHERE id = @order_id;

        COMMIT TRANSACTION;

        SELECT id, order_id, product_id, product_name, quantity, 
               CAST(unit_price AS FLOAT) AS unit_price, 
               CAST(total_price AS FLOAT) AS total_price 
        FROM dbo.order_items 
        WHERE id = @new_item_id;
      END TRY
      BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
      END CATCH
    `;

    const result = await this.databaseService.query<OrderItemRecord>(
      statement,
      {
        order_id: dto.order_id,
        product_id: dto.product_id,
        product_name: product.name,
        quantity: dto.quantity,
        unit_price: unitPrice.toFixed(2),
        total_price: totalPrice.toFixed(2),
      },
    );

    return result.recordset[0];
  }

  /**
   * Cập nhật mặt hàng (số lượng hoặc đổi sản phẩm):
   * Kiểm tra tồn kho, cập nhật lại đơn giá và total_price, rồi tính lại total_amount của đơn cha.
   */
  async update(
    id: number,
    dto: UpdateOrderItemDto,
    authHeader: string,
  ): Promise<OrderItemRecord> {
    const existing = await this.findOne(id);

    const orderResult = await this.databaseService.query<{
      id: number;
      status: string;
    }>('SELECT id, status FROM dbo.orders WHERE id = @order_id', {
      order_id: existing.order_id,
    });

    const parentOrder = orderResult.recordset[0];
    if (parentOrder && parentOrder.status !== 'pending') {
      throw new BadRequestException(
        `Không thể sửa mặt hàng của đơn hàng có trạng thái "${parentOrder.status}". Chỉ cho phép sửa đơn hàng "pending".`,
      );
    }

    const targetProductId = dto.product_id ?? existing.product_id;
    const product = await this.productClientService.getProduct(
      targetProductId,
      authHeader,
    );

    if (product.quantity < dto.quantity) {
      throw new ConflictException(
        `Sản phẩm "${product.name}" (ID: ${targetProductId}) không đủ tồn kho. Tồn kho hiện có: ${product.quantity}, yêu cầu: ${dto.quantity}`,
      );
    }

    const unitPrice = Number(product.price);
    const totalPrice = Number((unitPrice * dto.quantity).toFixed(2));

    const statement = `
      BEGIN TRANSACTION;
      BEGIN TRY
        UPDATE dbo.order_items
        SET product_id = @product_id,
            product_name = @product_name,
            quantity = @quantity,
            unit_price = CAST(@unit_price AS DECIMAL(10,2)),
            total_price = CAST(@total_price AS DECIMAL(10,2))
        WHERE id = @id;

        -- Cập nhật lại tổng tiền đơn cha
        UPDATE dbo.orders
        SET total_amount = (
              SELECT COALESCE(SUM(total_price), 0) 
              FROM dbo.order_items 
              WHERE order_id = @order_id
            ),
            updated_at = SYSDATETIME()
        WHERE id = @order_id;

        COMMIT TRANSACTION;

        SELECT id, order_id, product_id, product_name, quantity, 
               CAST(unit_price AS FLOAT) AS unit_price, 
               CAST(total_price AS FLOAT) AS total_price 
        FROM dbo.order_items 
        WHERE id = @id;
      END TRY
      BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
      END CATCH
    `;

    const result = await this.databaseService.query<OrderItemRecord>(
      statement,
      {
        id,
        order_id: existing.order_id,
        product_id: targetProductId,
        product_name: product.name,
        quantity: dto.quantity,
        unit_price: unitPrice.toFixed(2),
        total_price: totalPrice.toFixed(2),
      },
    );

    return result.recordset[0];
  }

  /**
   * Xóa một mặt hàng khỏi đơn hàng và tính lại tổng tiền đơn cha
   */
  async remove(id: number): Promise<{ message: string }> {
    const existing = await this.findOne(id);

    const orderResult = await this.databaseService.query<{
      id: number;
      status: string;
    }>('SELECT id, status FROM dbo.orders WHERE id = @order_id', {
      order_id: existing.order_id,
    });

    const parentOrder = orderResult.recordset[0];
    if (parentOrder && parentOrder.status !== 'pending') {
      throw new BadRequestException(
        `Không thể xóa mặt hàng của đơn hàng có trạng thái "${parentOrder.status}". Chỉ cho phép sửa đơn hàng "pending".`,
      );
    }

    const statement = `
      BEGIN TRANSACTION;
      BEGIN TRY
        DELETE FROM dbo.order_items WHERE id = @id;

        -- Tính lại total_amount và cập nhật updated_at của đơn cha
        UPDATE dbo.orders
        SET total_amount = (
              SELECT COALESCE(SUM(total_price), 0) 
              FROM dbo.order_items 
              WHERE order_id = @order_id
            ),
            updated_at = SYSDATETIME()
        WHERE id = @order_id;

        COMMIT TRANSACTION;
      END TRY
      BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
      END CATCH
    `;

    await this.databaseService.query(statement, {
      id,
      order_id: existing.order_id,
    });

    return { message: 'Mặt hàng đã được xóa thành công khỏi đơn hàng' };
  }
}
