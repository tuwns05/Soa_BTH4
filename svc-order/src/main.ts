import './config.js';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { setupSwagger } from './swagger.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  setupSwagger(app);

  const port = process.env.PORT ?? 3006;
  await app.listen(port);

  Logger.log(
    `Order Service running: http://localhost:${port}`,
    'Bootstrap',
  );
  Logger.log(
    `Order API Swagger: http://localhost:${port}/api`,
    'Bootstrap',
  );
}
await bootstrap();
