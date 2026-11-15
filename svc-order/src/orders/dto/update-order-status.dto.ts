import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';

export class UpdateOrderStatusDto {
  @ApiProperty({
    example: 'completed',
    enum: ['pending', 'completed', 'cancelled'],
    description: 'Trạng thái mới của đơn hàng (pending, completed, cancelled)',
  })
  @IsString()
  @IsIn(['pending', 'completed', 'cancelled'], {
    message: 'status phải là một trong các giá trị: pending, completed, cancelled',
  })
  status: 'pending' | 'completed' | 'cancelled';
}
