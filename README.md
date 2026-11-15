# BÀI THỰC HÀNH 4: XÂY DỰNG DỊCH VỤ QUẢN LÝ ĐƠN HÀNG (SVC-ORDER) TRONG KIẾN TRÚC SOA

## 1. Giới thiệu tổng quan

Bài thực hành này thực hiện thiết kế và phát triển **Dịch vụ Quản lý Đơn hàng (`svc-order`)** bằng framework **NestJS (TypeScript)**, tuân thủ chặt chẽ các nguyên tắc của kiến trúc hướng dịch vụ 
- **Phân tách trách nhiệm**: Mỗi service đảm nhận một nghiệp vụ chuyên biệt, sở hữu cơ sở dữ liệu độc lập.
- **Tính tự chủ và đóng gói**: Không truy vấn trực tiếp cơ sở dữ liệu của nhau, không sử dụng Foreign Key chéo database; toàn bộ giao tiếp giữa các service diễn ra qua giao thức HTTP RESTful API.
- **Ủy quyền xác thực**: `svc-order` không tự giải mã JWT hay lưu secret key, mà ủy quyền kiểm tra tính hợp lệ của token cho dịch vụ xác thực trung tâm qua HTTP.

---

## 2. Kiến trúc các dịch vụ trong hệ thống

Hệ thống bao gồm 3 dịch vụ hoạt động độc lập:

| Dịch vụ | Cổng | Cơ sở dữ liệu | Nguồn / Repository | Mô tả vai trò |
|---|---|---|---|---|
| **`svc-auth`** | `3004` | `SOA_BTH` | [tuwns05/nest-js-soa/svc-auth](https://github.com/tuwns05/nest-js-soa/tree/main/svc-auth) | Dịch vụ xác thực người dùng: Đăng nhập (`POST /auth/login`), kiểm tra tính hợp lệ của Token (`GET /auth/profile`). |
| **`svc-product`** | `3005` | `SOA_Product` | `C:\work_space\nest-js-soa\svc-product` | Dịch vụ quản lý sản phẩm: Cung cấp thông tin giá bán và số lượng tồn kho (`GET /products/:id`). |
| **`svc-order`** | `3006` | `SOA_Order` | `C:\work_space\Soa_BTH4\svc-order` | Dịch vụ quản lý đơn hàng (**Bài thực hành 4**): Quản lý `orders` và `order_items`. |

### Sơ đồ giao tiếp giữa các dịch vụ:

```
                      ┌───────────────────────────────────────────────┐
                      │              Client (Postman/UI)             │
                      └───────────────────────────────────────────────┘
                                      │
                 1. Đăng nhập         │  2. Gửi request kèm
            POST /auth/login          │     Bearer Token
                                      ▼
    ┌──────────────────────────┐             ┌──────────────────────────┐
    │         svc-auth         │ ◄────────── │        svc-order         │
    │        (Port 3004)       │  3. Xác thực│       (Port 3006)        │
    │ https://github.com/      │     Token   └─────────────┬────────────┘
    │ tuwns05/nest-js-soa/     │  GET /auth/               │
    │ tree/main/svc-auth       │     profile               │ 4. Kiểm tra tồn kho &
    └─────────────┬────────────┘                           │    lấy giá thật
                  │                                        ▼    GET /products/:id
                  ▼ SQL                               ┌──────────────────────────┐
           ┌──────────────┐                           │       svc-product        │
           │   SOA_BTH    │                           │       (Port 3005)        │
           └──────────────┘                           └─────────────┬────────────┘
                                                                    │
                                                                    ▼ SQL
                                      ┌──────────────┐       ┌──────────────┐
                                      │  SOA_Order   │       │ SOA_Product  │
                                      └──────────────┘       └──────────────┘
```

---

## 3. Cấu trúc thư mục của Bài thực hành 4

```
Soa_BTH4/
├── shared/
│   └── database/                 # Module kết nối SQL Server dùng chung (@soa/database)
├── svc-order/                    # Dịch vụ Quản lý Đơn hàng (Bài thực hành 4)
│   ├── database/
│   │   └── SOA_Order.sql         # Script T-SQL khởi tạo Database SOA_Order và dữ liệu mẫu
│   ├── src/
│   │   ├── auth/                 # AuthGuard ủy quyền xác thực sang svc-auth
│   │   ├── common/               # ProductClientService gọi HTTP sang svc-product
│   │   ├── order-items/          # Module quản lý chi tiết mặt hàng đơn hàng
│   │   ├── orders/               # Module quản lý đơn hàng
│   │   ├── app.module.ts
│   │   ├── config.ts
│   │   ├── main.ts               # Khởi chạy ứng dụng tại cổng 3006
│   │   └── swagger.ts            # Cấu hình Swagger API Docs
│   ├── .env                      # Cấu hình biến môi trường
│   ├── .env.example
│   ├── package.json
│   ├── tsconfig.json
│   └── README.md
└── README.md                     # Tài liệu tổng quan này
```

---

## 4. Hướng dẫn cài đặt & Khởi chạy hệ thống

### Bước 1: Khởi tạo Cơ sở dữ liệu `SOA_Order`

Chạy script T-SQL trong SSMS hoặc sqlcmd:
```powershell
sqlcmd -S "LAPTOP-TUNWS\VIETTUAN" -E -i "C:\work_space\Soa_BTH4\svc-order\database\SOA_Order.sql"
```

### Bước 2: Khởi động Dịch vụ Xác thực (`svc-auth` - Port 3004)

> Mã nguồn dịch vụ xác thực: [https://github.com/tuwns05/nest-js-soa/tree/main/svc-auth](https://github.com/tuwns05/nest-js-soa/tree/main/svc-auth)

Mở **Terminal 1**:
```powershell
cd C:\work_space\nest-js-soa\svc-auth
npm install
npm run start:dev
```
*Service chạy tại: `http://localhost:3004` (Swagger: `http://localhost:3004/api`)*

### Bước 3: Khởi động Dịch vụ Sản phẩm (`svc-product` - Port 3005)

Mở **Terminal 2**:
```powershell
cd C:\work_space\nest-js-soa\svc-product
npm install
npm run start:dev
```
*Service chạy tại: `http://localhost:3005` (Swagger: `http://localhost:3005/api`)*

### Bước 4: Khởi động Dịch vụ Quản lý Đơn hàng (`svc-order` - Port 3006)

Mở **Terminal 3**:
```powershell
cd C:\work_space\Soa_BTH4\svc-order
npm install
npm run start:dev
```
*Service chạy tại: `http://localhost:3006` (Swagger: `http://localhost:3006/api`)*

---

## 5. Danh sách API Endpoints (`svc-order`)

Tất cả các API dưới đây đều được bảo vệ bởi `AuthGuard` và yêu cầu header:
`Authorization: Bearer <access_token>` (lấy từ `POST /auth/login` của `svc-auth`).

### 1. Quản lý Đơn hàng (`/orders`)
| Method | Endpoint | Mô tả |
|---|---|---|
| `GET` | `/orders` | Lấy danh sách tất cả các đơn hàng |
| `GET` | `/orders/:id` | Xem chi tiết đơn hàng (kèm theo danh sách `order_items`) |
| `POST` | `/orders` | Tạo đơn hàng mới (kiểm tra tồn kho qua `svc-product`, lưu trong SQL transaction) |
| `PUT` | `/orders/:id` | Cập nhật trạng thái (`pending`, `completed`, `cancelled`). Không cho chuyển ngược từ `completed`/`cancelled` về `pending`. |
| `DELETE`| `/orders/:id` | Xóa đơn hàng (tự động xóa cascade các `order_items` liên kết) |

### 2. Quản lý Mặt hàng chi tiết (`/order_items`)
| Method | Endpoint | Mô tả |
|---|---|---|
| `GET` | `/order_items` | Danh sách tất cả các mặt hàng trong các đơn hàng |
| `GET` | `/order_items/:id` | Xem thông tin chi tiết một mặt hàng |
| `POST` | `/order_items` | Thêm mặt hàng vào đơn hàng (kiểm tra tồn kho, tính lại tổng tiền đơn cha) |
| `PUT` | `/order_items/:id` | Cập nhật số lượng/sản phẩm (tính lại đơn giá và tổng tiền đơn cha) |
| `DELETE`| `/order_items/:id` | Xóa mặt hàng khỏi đơn (tự động trừ tổng tiền đơn cha tương ứng) |

---

## 6. Kết luận & Điểm nổi bật về kiến trúc SOA trong bài làm

1. **Tuân thủ triệt để SOA**: Dịch vụ `svc-order` hoàn toàn độc lập, giao tiếp với [svc-auth](https://github.com/tuwns05/nest-js-soa/tree/main/svc-auth) và `svc-product` qua HTTP REST API.
2. **Không chia sẻ Database hay Secrets**: Không sử dụng Foreign Key chéo database, không giải mã JWT nội bộ và không dùng chung JWT secret key.
3. **Độ tin cậy cao**: Tích hợp kiểm tra số lượng tồn kho tự động, cơ chế SQL Transaction toàn vẹn dữ liệu.

---

## 7. Cơ chế xử lý gọi Dịch vụ Xác thực (`svc-auth`)

`svc-order` ủy quyền xác thực hoàn toàn cho [svc-auth (cổng 3004)](https://github.com/tuwns05/nest-js-soa/tree/main/svc-auth) qua HTTP (tuân thủ SOA: không giải mã JWT, không giữ secret key, không truy cập CSDL auth).

### 7.1. Sơ đồ luồng xử lý (`AuthGuard`)

```
[ Client ]
    │
    │ 1. Request + Header: Authorization: Bearer <token>
    ▼
[ AuthGuard (svc-order) ]
    │
    ├── Thiếu header hoặc sai định dạng? ──────> [ 401 Unauthorized ]
    │
    │ 2. Forward: GET http://localhost:3004/auth/profile (timeout: 3s)
    ▼
[ svc-auth (cổng 3004) ]
    │
    ├── 200 OK (Token hợp lệ) ────────> req.user = data ──> [ Vào Controller ]
    ├── 401/403 (Token sai/hết hạn) ──────────────────────> [ 401 Unauthorized ]
    └── Mất kết nối / Timeout 3s ─────────────────────────> [ 503 Service Unavailable ]
```

### 7.2. Ba bước xử lý cốt lõi (`src/auth/auth.guard.ts`)

1. **Lọc Header tại chỗ**: Kiểm tra `request.headers.authorization`. Nếu thiếu hoặc không bắt đầu bằng `Bearer `, lập tức trả về `401 Unauthorized` (chặn ngay request rác).
2. **Gọi HTTP sang `svc-auth`**: Chuyển tiếp nguyên văn header `Authorization` sang `GET http://localhost:3004/auth/profile` với `timeout: 3000ms` qua `axios`.
3. **Phân loại phản hồi**:
   - **`200 OK`**: Hợp lệ $\rightarrow$ Gán `req.user = response.data`, cho phép request vào Controller.
   - **`401 / 403`**: Token sai hoặc hết hạn $\rightarrow$ Trả về `401 Unauthorized`.
   - **Mất kết nối / Timeout 3s**: `svc-auth` tắt hoặc không phản hồi $\rightarrow$ Trả về `503 Service Unavailable`.
