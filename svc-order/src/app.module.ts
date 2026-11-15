import { Module, ValidationPipe } from '@nestjs/common';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { DatabaseModule } from '@soa/database';
import { AuthGuard } from './auth/auth.guard.js';
import { AuthModule } from './auth/auth.module.js';
import { CommonModule } from './common/common.module.js';
import { OrderItemsModule } from './order-items/order-items.module.js';
import { OrdersModule } from './orders/orders.module.js';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    CommonModule,
    OrdersModule,
    OrderItemsModule,
  ],
  providers: [
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    },
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
})
export class AppModule {}
