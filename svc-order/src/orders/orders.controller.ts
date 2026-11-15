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
import { CreateOrderDto } from './dto/create-order.dto.js';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto.js';
import { OrdersService } from './orders.service.js';

@ApiTags('orders')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token JWT bị thiếu, sai hoặc đã hết hạn' })
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách tất cả các đơn hàng' })
  findAll() {
    return this.ordersService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy chi tiết một đơn hàng theo ID (kèm danh sách order_items)' })
  @ApiResponse({ status: 200, description: 'Chi tiết đơn hàng' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy đơn hàng' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.ordersService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Tạo đơn hàng mới (kiểm tra tồn kho và lấy giá từ svc-product)' })
  @ApiResponse({ status: 201, description: 'Tạo đơn hàng thành công' })
  @ApiResponse({ status: 400, description: 'Dữ liệu đầu vào không hợp lệ' })
  @ApiResponse({ status: 404, description: 'Sản phẩm không tồn tại trong svc-product' })
  @ApiResponse({ status: 409, description: 'Sản phẩm không đủ tồn kho' })
  @ApiResponse({ status: 503, description: 'Không thể kết nối đến svc-auth hoặc svc-product' })
  create(
    @Body() body: CreateOrderDto,
    @Headers('authorization') authHeader: string,
  ) {
    return this.ordersService.create(body, authHeader);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Cập nhật trạng thái đơn hàng (pending, completed, cancelled)' })
  @ApiResponse({ status: 200, description: 'Cập nhật trạng thái thành công' })
  @ApiResponse({ status: 400, description: 'Dữ liệu không hợp lệ hoặc cố tình đổi từ completed/cancelled về pending' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy đơn hàng' })
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateStatus(id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Xóa một đơn hàng (tự động xóa các mặt hàng liên quan)' })
  @ApiResponse({ status: 200, description: 'Xóa đơn hàng thành công' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy đơn hàng' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.ordersService.remove(id);
  }
}
