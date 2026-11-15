import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Order Management API')
    .setDescription(
      'Dịch vụ quản lý đơn hàng (Order Service) trong kiến trúc SOA. Đăng nhập tại svc-auth POST /auth/login (cổng 3004) để lấy access_token, sau đó dán vào nút Authorize bên dưới.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  SwaggerModule.setup('api', app, SwaggerModule.createDocument(app, config));
}
