import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

if (existsSync('.env')) {
  loadEnvFile('.env');
}

// Cấu hình cổng và database cho svc-order
process.env.PORT ??= '3006';
process.env.DB_NAME ??= 'SOA_Order';
process.env.AUTH_SERVICE_URL ??= 'http://localhost:3004';
process.env.PRODUCT_SERVICE_URL ??= 'http://localhost:3005';

// Tách DB_SERVER thành DB_HOST và DB_INSTANCE nếu có truyền DB_SERVER=LAPTOP-TUNWS\VIETTUAN
if (process.env.DB_SERVER) {
  const parts = process.env.DB_SERVER.split('\\');
  if (parts[0]) {
    process.env.DB_HOST ??= parts[0];
  }
  if (parts[1]) {
    process.env.DB_INSTANCE ??= parts[1];
  }
}
