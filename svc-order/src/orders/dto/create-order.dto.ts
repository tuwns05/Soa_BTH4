import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsInt,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class OrderItemInputDto {
  @ApiProperty({ example: 1, description: 'ID sản phẩm từ svc-product' })
  @IsInt()
  @Min(1)
  product_id: number;

  @ApiProperty({ example: 2, description: 'Số lượng mua' })
  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreateOrderDto {
  @ApiProperty({ example: 'Nguyễn Văn An', maxLength: 255, description: 'Tên khách hàng' })
  @IsString()
  @Matches(/\S/, { message: 'customer_name không được để trống' })
  @MaxLength(255)
  customer_name: string;

  @ApiProperty({ example: 'nguyenvanan@example.com', maxLength: 255, description: 'Email khách hàng' })
  @IsEmail({}, { message: 'customer_email phải là email hợp lệ' })
  @MaxLength(255)
  customer_email: string;

  @ApiProperty({
    type: [OrderItemInputDto],
    description: 'Danh sách các mặt hàng trong đơn hàng (ít nhất 1 sản phẩm)',
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'Đơn hàng phải chứa ít nhất 1 mặt hàng' })
  @ValidateNested({ each: true })
  @Type(() => OrderItemInputDto)
  items: OrderItemInputDto[];
}
