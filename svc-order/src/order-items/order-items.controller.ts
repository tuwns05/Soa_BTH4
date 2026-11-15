import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CreateOrderItemDto } from './dto/create-order-item.dto.js';
import { UpdateOrderItemDto } from './dto/update-order-item.dto.js';
import { OrderItemsService } from './order-items.service.js';

@ApiTags('order_items')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token JWT bị thiếu, sai hoặc đã hết hạn' })
@Controller('order_items')
export class OrderItemsController {
  constructor(private readonly orderItemsService: OrderItemsService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách tất cả mặt hàng trong các đơn hàng' })
  findAll() {
    return this.orderItemsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy thông tin chi tiết một mặt hàng' })
  @ApiResponse({ status: 200, description: 'Chi tiết mặt hàng' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy mặt hàng' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.orderItemsService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Tạo mặt hàng mới trong đơn hàng (kiểm tra tồn kho và cập nhật tổng tiền đơn cha)' })
  @ApiResponse({ status: 201, description: 'Thêm mặt hàng thành công' })
  @ApiResponse({ status: 400, description: 'Dữ liệu không hợp lệ hoặc đơn hàng không ở trạng thái pending' })
  @ApiResponse({ status: 404, description: 'Đơn hàng cha hoặc sản phẩm không tồn tại' })
  @ApiResponse({ status: 409, description: 'Sản phẩm không đủ tồn kho' })
  @ApiResponse({ status: 503, description: 'Không thể kết nối đến svc-auth hoặc svc-product' })
  create(
    @Body() body: CreateOrderItemDto,
    @Headers('authorization') authHeader: string,
  ) {
    return this.orderItemsService.create(body, authHeader);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Cập nhật mặt hàng (số lượng/sản phẩm, tính lại đơn giá và cập nhật tổng tiền đơn cha)' })
  @ApiResponse({ status: 200, description: 'Cập nhật mặt hàng thành công' })
  @ApiResponse({ status: 400, description: 'Dữ liệu không hợp lệ hoặc đơn hàng không ở trạng thái pending' })
  @ApiResponse({ status: 404, description: 'Mặt hàng hoặc sản phẩm không tồn tại' })
  @ApiResponse({ status: 409, description: 'Sản phẩm không đủ tồn kho' })
  @ApiResponse({ status: 503, description: 'Không thể kết nối đến svc-auth hoặc svc-product' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateOrderItemDto,
    @Headers('authorization') authHeader: string,
  ) {
    return this.orderItemsService.update(id, body, authHeader);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Xóa một mặt hàng và tự động cập nhật lại tổng tiền đơn hàng cha' })
  @ApiResponse({ status: 200, description: 'Xóa mặt hàng thành công' })
  @ApiResponse({ status: 400, description: 'Đơn hàng không ở trạng thái pending' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy mặt hàng' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.orderItemsService.remove(id);
  }
}
