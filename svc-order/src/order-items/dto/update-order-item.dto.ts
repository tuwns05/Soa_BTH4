import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Min } from 'class-validator';

export class UpdateOrderItemDto {
  @ApiPropertyOptional({ example: 2, description: 'ID sản phẩm mới nếu muốn thay đổi mặt hàng' })
  @IsOptional()
  @IsInt()
  @Min(1)
  product_id?: number;

  @ApiProperty({ example: 3, description: 'Số lượng mua mới' })
  @IsInt()
  @Min(1)
  quantity: number;
}
