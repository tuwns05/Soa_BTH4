import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import { OrdersService } from '../src/orders/orders.service.js';
import { OrderItemsService } from '../src/order-items/order-items.service.js';
import { AuthGuard } from '../src/auth/auth.guard.js';
import { ProductClientService } from '../src/common/product-client.service.js';

describe('Order Service (svc-order) Unit & Integration Tests', () => {
  let ordersService: OrdersService;
  let orderItemsService: OrderItemsService;
  let authGuard: AuthGuard;
  let productClientService: ProductClientService;

  const mockDatabase = {
    query: vi.fn(),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    mockDatabase.query.mockReset();

    productClientService = new ProductClientService();
    ordersService = new OrdersService(mockDatabase as any, productClientService);
    orderItemsService = new OrderItemsService(mockDatabase as any, productClientService);
    authGuard = new AuthGuard();
  });

  // =========================================================================
  // 1. Kiểm thử AuthGuard (Xác thực ủy quyền qua svc-auth)
  // =========================================================================
  describe('AuthGuard (Xác thực với svc-auth)', () => {
    const mockContext = (authHeader?: string) => {
      const req: any = { headers: {} };
      if (authHeader !== undefined) {
        req.headers.authorization = authHeader;
      }
      return {
        switchToHttp: () => ({
          getRequest: () => req,
        }),
      } as any;
    };

    it('Ném lỗi UnauthorizedException (401) khi thiếu header Authorization', async () => {
      const context = mockContext(undefined);
      await expect(authGuard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('Ném lỗi UnauthorizedException (401) khi định dạng không phải Bearer token', async () => {
      const context = mockContext('Basic 123456');
      await expect(authGuard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('Xác thực thành công và gắn req.user khi svc-auth phản hồi 200 OK', async () => {
      const context = mockContext('Bearer valid_token');
      vi.spyOn(axios, 'get').mockResolvedValueOnce({
        status: 200,
        data: { sub: '1', username: 'admin' },
      });

      const canActivate = await authGuard.canActivate(context);
      expect(canActivate).toBe(true);
      const req = context.switchToHttp().getRequest();
      expect(req.user).toEqual({ sub: '1', username: 'admin' });
    });

    it('Ném lỗi UnauthorizedException (401) khi svc-auth trả về lỗi 401 (token sai / hết hạn)', async () => {
      const context = mockContext('Bearer expired_token');
      vi.spyOn(axios, 'get').mockRejectedValueOnce(
        new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', undefined, undefined, {
          status: 401,
          statusText: 'Unauthorized',
          headers: {},
          config: {} as any,
          data: { message: 'Token expired' },
        }),
      );

      await expect(authGuard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('Ném lỗi ServiceUnavailableException (503) khi không thể kết nối tới svc-auth', async () => {
      const context = mockContext('Bearer valid_token');
      vi.spyOn(axios, 'get').mockRejectedValueOnce(
        new AxiosError('connect ECONNREFUSED 127.0.0.1:3004', 'ECONNREFUSED'),
      );

      await expect(authGuard.canActivate(context)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  // =========================================================================
  // 2. Kiểm thử OrdersService (Nghiệp vụ Đơn hàng)
  // =========================================================================
  describe('OrdersService', () => {
    const authHeader = 'Bearer token_abc';

    it('findAll: Lấy danh sách tất cả các đơn hàng', async () => {
      const mockOrders = [
        { id: 1, customer_name: 'Nguyễn Văn An', total_amount: 1500000, status: 'completed' },
      ];
      mockDatabase.query.mockResolvedValueOnce({ recordset: mockOrders });

      const result = await ordersService.findAll();
      expect(result).toHaveLength(1);
      expect(result[0].customer_name).toBe('Nguyễn Văn An');
    });

    it('findOne: Lấy chi tiết đơn hàng kèm danh sách order_items', async () => {
      const mockOrder = { id: 1, customer_name: 'Nguyễn Văn An', total_amount: 1500000, status: 'completed' };
      const mockItems = [
        { id: 10, order_id: 1, product_id: 1, product_name: 'Bàn phím cơ', quantity: 2, unit_price: 500000, total_price: 1000000 },
      ];

      mockDatabase.query
        .mockResolvedValueOnce({ recordset: [mockOrder] })
        .mockResolvedValueOnce({ recordset: mockItems });

      const result = await ordersService.findOne(1);
      expect(result.id).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items![0].product_name).toBe('Bàn phím cơ');
    });

    it('findOne: Ném NotFoundException (404) khi đơn hàng không tồn tại', async () => {
      mockDatabase.query.mockResolvedValueOnce({ recordset: [] });
      await expect(ordersService.findOne(999)).rejects.toThrow(NotFoundException);
    });

    it('create: Ném NotFoundException (404) khi sản phẩm không tồn tại trong svc-product', async () => {
      vi.spyOn(productClientService, 'getProduct').mockRejectedValueOnce(
        new NotFoundException('Sản phẩm với ID 999 không tồn tại trong hệ thống'),
      );

      await expect(
        ordersService.create(
          {
            customer_name: 'Khách A',
            customer_email: 'a@example.com',
            items: [{ product_id: 999, quantity: 1 }],
          },
          authHeader,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('create: Ném ConflictException (409) khi sản phẩm không đủ tồn kho', async () => {
      vi.spyOn(productClientService, 'getProduct').mockResolvedValueOnce({
        id: 1,
        name: 'Bàn phím cơ',
        price: 500000,
        quantity: 3, // Kho chỉ còn 3
        description: null,
      });

      await expect(
        ordersService.create(
          {
            customer_name: 'Khách A',
            customer_email: 'a@example.com',
            items: [{ product_id: 1, quantity: 5 }], // Yêu cầu 5
          },
          authHeader,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('create: Thành công tạo đơn hàng và các mặt hàng trong transaction với status pending', async () => {
      vi.spyOn(productClientService, 'getProduct').mockResolvedValueOnce({
        id: 1,
        name: 'Bàn phím cơ',
        price: 500000,
        quantity: 20,
        description: null,
      });

      const createdOrder = {
        id: 10,
        customer_name: 'Nguyễn Văn An',
        customer_email: 'an@example.com',
        total_amount: 1000000,
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const createdItems = [
        {
          id: 101,
          order_id: 10,
          product_id: 1,
          product_name: 'Bàn phím cơ',
          quantity: 2,
          unit_price: 500000,
          total_price: 1000000,
        },
      ];

      mockDatabase.query
        .mockResolvedValueOnce({ recordset: [createdOrder] }) // Transaction query
        .mockResolvedValueOnce({ recordset: [createdOrder] }) // findOne order
        .mockResolvedValueOnce({ recordset: createdItems }); // findOne items

      const result = await ordersService.create(
        {
          customer_name: 'Nguyễn Văn An',
          customer_email: 'an@example.com',
          items: [{ product_id: 1, quantity: 2 }],
        },
        authHeader,
      );

      expect(result.id).toBe(10);
      expect(result.status).toBe('pending');
      expect(result.total_amount).toBe(1000000);
      expect(result.items).toHaveLength(1);
      expect(result.items![0].product_name).toBe('Bàn phím cơ');
      expect(result.items![0].unit_price).toBe(500000);
    });

    it('updateStatus: Cập nhật thành công trạng thái từ pending sang completed', async () => {
      mockDatabase.query
        .mockResolvedValueOnce({ recordset: [{ id: 1, status: 'pending' }] })
        .mockResolvedValueOnce({ recordset: [] })
        .mockResolvedValueOnce({ recordset: [{ id: 1, status: 'completed' }] })
        .mockResolvedValueOnce({ recordset: [] });

      const result = await ordersService.updateStatus(1, { status: 'completed' });
      expect(result.status).toBe('completed');
    });

    it('updateStatus: Từ chối chuyển từ completed về pending (400 Bad Request)', async () => {
      mockDatabase.query.mockResolvedValueOnce({
        recordset: [{ id: 1, status: 'completed' }],
      });

      await expect(
        ordersService.updateStatus(1, { status: 'pending' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('updateStatus: Từ chối chuyển từ cancelled về pending (400 Bad Request)', async () => {
      mockDatabase.query.mockResolvedValueOnce({
        recordset: [{ id: 1, status: 'cancelled' }],
      });

      await expect(
        ordersService.updateStatus(1, { status: 'pending' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('remove: Xóa đơn hàng thành công', async () => {
      mockDatabase.query
        .mockResolvedValueOnce({ recordset: [{ id: 1 }] })
        .mockResolvedValueOnce({ recordset: [] });

      const res = await ordersService.remove(1);
      expect(res.message).toContain('thành công');
    });

    it('remove: Ném NotFoundException (404) khi đơn hàng không tồn tại', async () => {
      mockDatabase.query.mockResolvedValueOnce({ recordset: [] });
      await expect(ordersService.remove(999)).rejects.toThrow(NotFoundException);
    });
  });

  // =========================================================================
  // 3. Kiểm thử OrderItemsService (Nghiệp vụ Mặt hàng trong đơn)
  // =========================================================================
  describe('OrderItemsService', () => {
    const authHeader = 'Bearer token_abc';

    it('create: Thêm mặt hàng mới và cập nhật total_amount đơn cha', async () => {
      mockDatabase.query.mockResolvedValueOnce({
        recordset: [{ id: 1, status: 'pending' }],
      });

      vi.spyOn(productClientService, 'getProduct').mockResolvedValueOnce({
        id: 2,
        name: 'Chuột không dây',
        price: 300000,
        quantity: 10,
        description: null,
      });

      const newItem = {
        id: 50,
        order_id: 1,
        product_id: 2,
        product_name: 'Chuột không dây',
        quantity: 2,
        unit_price: 300000,
        total_price: 600000,
      };

      mockDatabase.query.mockResolvedValueOnce({ recordset: [newItem] });

      const result = await orderItemsService.create(
        { order_id: 1, product_id: 2, quantity: 2 },
        authHeader,
      );

      expect(result.id).toBe(50);
      expect(result.total_price).toBe(600000);
    });

    it('create: Ném BadRequestException (400) khi thêm mặt hàng vào đơn completed', async () => {
      mockDatabase.query.mockResolvedValueOnce({
        recordset: [{ id: 1, status: 'completed' }],
      });

      await expect(
        orderItemsService.create(
          { order_id: 1, product_id: 2, quantity: 1 },
          authHeader,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('create: Ném ConflictException (409) khi sản phẩm không đủ tồn kho', async () => {
      mockDatabase.query.mockResolvedValueOnce({
        recordset: [{ id: 1, status: 'pending' }],
      });

      vi.spyOn(productClientService, 'getProduct').mockResolvedValueOnce({
        id: 2,
        name: 'Chuột không dây',
        price: 300000,
        quantity: 1, // Kho chỉ còn 1
        description: null,
      });

      await expect(
        orderItemsService.create(
          { order_id: 1, product_id: 2, quantity: 5 }, // Yêu cầu 5
          authHeader,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('update: Cập nhật số lượng và tính lại tổng tiền đơn cha', async () => {
      const existingItem = {
        id: 50,
        order_id: 1,
        product_id: 2,
        product_name: 'Chuột không dây',
        quantity: 1,
        unit_price: 300000,
        total_price: 300000,
      };

      mockDatabase.query
        .mockResolvedValueOnce({ recordset: [existingItem] }) // findOne item
        .mockResolvedValueOnce({ recordset: [{ id: 1, status: 'pending' }] }); // parent order status

      vi.spyOn(productClientService, 'getProduct').mockResolvedValueOnce({
        id: 2,
        name: 'Chuột không dây',
        price: 300000,
        quantity: 20,
        description: null,
      });

      const updatedItem = {
        ...existingItem,
        quantity: 3,
        total_price: 900000,
      };

      mockDatabase.query.mockResolvedValueOnce({ recordset: [updatedItem] });

      const result = await orderItemsService.update(50, { quantity: 3 }, authHeader);
      expect(result.quantity).toBe(3);
      expect(result.total_price).toBe(900000);
    });

    it('remove: Xóa mặt hàng thành công', async () => {
      const existingItem = {
        id: 50,
        order_id: 1,
        product_id: 2,
        quantity: 1,
        unit_price: 300000,
        total_price: 300000,
      };

      mockDatabase.query
        .mockResolvedValueOnce({ recordset: [existingItem] }) // findOne item
        .mockResolvedValueOnce({ recordset: [{ id: 1, status: 'pending' }] }) // parent order status
        .mockResolvedValueOnce({ recordset: [] }); // transaction delete & update

      const result = await orderItemsService.remove(50);
      expect(result.message).toContain('thành công');
    });

    it('remove: Ném BadRequestException (400) khi xóa mặt hàng của đơn đã completed', async () => {
      const existingItem = {
        id: 50,
        order_id: 1,
        product_id: 2,
        quantity: 1,
        unit_price: 300000,
        total_price: 300000,
      };

      mockDatabase.query
        .mockResolvedValueOnce({ recordset: [existingItem] }) // findOne item
        .mockResolvedValueOnce({ recordset: [{ id: 1, status: 'completed' }] }); // parent order completed

      await expect(orderItemsService.remove(50)).rejects.toThrow(BadRequestException);
    });
  });
});
