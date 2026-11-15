# svc-order — Dịch vụ Quản lý Đơn hàng (Order Management Service)

> **Bài thực hành 4: Kiến trúc hướng dịch vụ (SOA)**  
> Dịch vụ quản lý đơn hàng (`svc-order`) hoạt động độc lập, liên kết xác thực với dịch vụ **`svc-auth`** tại repository:  
> 🔗 **[https://github.com/tuwns05/nest-js-soa/tree/main/svc-auth](https://github.com/tuwns05/nest-js-soa/tree/main/svc-auth)**

---

## 1. Thông tin dịch vụ

| Thuộc tính | Cấu hình |
|---|---|
| **Cổng dịch vụ (Port)** | `3006` (biến môi trường `PORT`) |
| **Cơ sở dữ liệu** | `SOA_Order` (SQL Server, tách biệt hoàn toàn) |
| **Máy chủ SQL Server** | `LAPTOP-TUNWS\VIETTUAN`, Windows Authentication |
| **Swagger UI** | `http://localhost:3006/api` |
| **Dịch vụ Auth liên kết** | `http://localhost:3004` ([svc-auth trên GitHub](https://github.com/tuwns05/nest-js-soa/tree/main/svc-auth)) |
| **Dịch vụ Product liên kết**| `http://localhost:3005` |

---

## 2. Kiến trúc Xác thực & Liên kết SOA

Theo đúng chuẩn SOA:
1. `svc-order` **không** chứa database người dùng (`dbo.User`), **không** import `@nestjs/jwt`, và **không** giữ JWT secret key.
2. Mọi API của `svc-order` đều đi qua `AuthGuard` tại [src/auth/auth.guard.ts](src/auth/auth.guard.ts).
3. `AuthGuard` trích xuất `Authorization: Bearer <token>` và gọi trực tiếp sang `GET {AUTH_SERVICE_URL}/auth/profile` của [svc-auth (cổng 3004)](https://github.com/tuwns05/nest-js-soa/tree/main/svc-auth) với timeout 3s:
   - Nếu `svc-auth` phản hồi `200 OK`: Request được thông qua.
   - Nếu `svc-auth` phản hồi `401 Unauthorized` hoặc thiếu token: Trả về `401 Unauthorized`.
   - Nếu `svc-auth` không phản hồi hoặc mất kết nối: Trả về `503 Service Unavailable`.

```
[Client] ──(Bearer Token)──> [svc-order (3006)]
                                    │
                         GET /auth/profile (timeout 3s)
                                    │
                                    ▼
                        [svc-auth (3004)]
             https://github.com/tuwns05/nest-js-soa/tree/main/svc-auth
```

---

## 3. Khởi tạo Cơ sở dữ liệu

Chạy file script T-SQL độc lập:
```powershell
sqlcmd -S "LAPTOP-TUNWS\VIETTUAN" -E -i "database/SOA_Order.sql"
```
*Script idempotent, tự động tạo CSDL `SOA_Order`, các bảng `orders`, `order_items`, quan hệ cascade, ràng buộc check và dữ liệu mẫu.*

---

## 4. Hướng dẫn Khởi chạy

### Bước 1: Khởi động `svc-auth` (Cổng 3004)
Tham khảo mã nguồn và cài đặt từ: [https://github.com/tuwns05/nest-js-soa/tree/main/svc-auth](https://github.com/tuwns05/nest-js-soa/tree/main/svc-auth)
```powershell
cd C:\work_space\nest-js-soa\svc-auth
npm run start:dev
```

### Bước 2: Khởi động `svc-product` (Cổng 3005)
```powershell
cd C:\work_space\nest-js-soa\svc-product
npm run start:dev
```

### Bước 3: Khởi động `svc-order` (Cổng 3006)
```powershell
cd C:\work_space\Soa_BTH4\svc-order
npm install
npm run start:dev
```

---

## 5. Danh sách API Endpoints

### Orders
- `GET /orders` — Danh sách tất cả đơn hàng
- `GET /orders/:id` — Chi tiết đơn hàng kèm các mặt hàng (`order_items`)
- `POST /orders` — Tạo đơn hàng mới (tự động kiểm tra tồn kho và lấy giá từ `svc-product`)
- `PUT /orders/:id` — Cập nhật trạng thái (`pending`, `completed`, `cancelled`)
- `DELETE /orders/:id` — Xóa đơn hàng (cascade xóa các mặt hàng con)

### Order Items
- `GET /order_items` — Danh sách tất cả mặt hàng trong các đơn
- `GET /order_items/:id` — Chi tiết một mặt hàng
- `POST /order_items` — Thêm mặt hàng vào đơn (chỉ cho phép khi đơn ở trạng thái `pending`)
- `PUT /order_items/:id` — Sửa mặt hàng (kiểm tra tồn kho và tính lại tổng tiền đơn cha)
- `DELETE /order_items/:id` — Xóa mặt hàng (tính lại tổng tiền đơn cha)

---

## 6. Lệnh kiểm thử

### Kiểm thử Unit Test (Vitest)
```powershell
npm test
```
*Chạy 22/22 unit tests bao phủ toàn bộ AuthGuard, OrdersService và OrderItemsService.*

### Kiểm thử tích hợp qua PowerShell
```powershell
# 1. Đăng nhập tại svc-auth lấy token
$login = Invoke-RestMethod -Uri "http://localhost:3004/auth/login" -Method POST -ContentType "application/json" -Body '{"UserName":"admin","Password":"123456"}'
$token = $login.access_token

# 2. Gọi svc-order với token
Invoke-RestMethod -Uri "http://localhost:3006/orders" -Headers @{ Authorization = "Bearer $token" }
```
