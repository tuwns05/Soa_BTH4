import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module.js';
import { OrderItemsController } from './order-items.controller.js';
import { OrderItemsService } from './order-items.service.js';

@Module({
  imports: [CommonModule],
  controllers: [OrderItemsController],
  providers: [OrderItemsService],
  exports: [OrderItemsService],
})
export class OrderItemsModule {}
