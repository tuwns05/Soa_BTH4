import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class CreateOrderItemDto {
  @ApiProperty({ example: 1, description: 'ID đơn hàng cha' })
  @IsInt()
  @Min(1)
  order_id: number;

  @ApiProperty({ example: 2, description: 'ID sản phẩm từ svc-product' })
  @IsInt()
  @Min(1)
  product_id: number;

  @ApiProperty({ example: 1, description: 'Số lượng mua' })
  @IsInt()
  @Min(1)
  quantity: number;
}
