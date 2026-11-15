import { Module } from '@nestjs/common';
import { ProductClientService } from './product-client.service.js';

@Module({
  providers: [ProductClientService],
  exports: [ProductClientService],
})
export class CommonModule {}
