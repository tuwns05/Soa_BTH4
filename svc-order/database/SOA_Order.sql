-- ============================================================================
-- KỊCH BẢN KHỞI TẠO CƠ SỞ DỮ LIỆU SOA_Order (DỊCH VỤ QUẢN LÝ ĐƠN HÀNG)
-- Hệ quản trị cơ sở dữ liệu: Microsoft SQL Server (T-SQL)
-- Tính chất: Idempotent (Có thể chạy lại nhiều lần an toàn mà không phát sinh lỗi)
-- Không tham chiếu trực tiếp đến bất kỳ cơ sở dữ liệu nào khác (tuân thủ SOA).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Khối 1: Tạo cơ sở dữ liệu SOA_Order nếu chưa tồn tại
-- ----------------------------------------------------------------------------
IF DB_ID('SOA_Order') IS NULL
BEGIN
    CREATE DATABASE SOA_Order;
    PRINT N'Đã tạo cơ sở dữ liệu SOA_Order.';
END
ELSE
BEGIN
    PRINT N'Cơ sở dữ liệu SOA_Order đã tồn tại.';
END
GO

-- Chuyển ngữ cảnh làm việc sang cơ sở dữ liệu SOA_Order
USE SOA_Order;
GO

-- ----------------------------------------------------------------------------
-- Khối 2: Tạo bảng orders (Lưu thông tin tổng quan của đơn hàng)
-- ----------------------------------------------------------------------------
IF OBJECT_ID('dbo.orders', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.orders (
        id INT PRIMARY KEY IDENTITY(1,1),
        customer_name NVARCHAR(255) NOT NULL,
        customer_email VARCHAR(255) NOT NULL,
        total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        CONSTRAINT CK_orders_status CHECK (status IN ('pending', 'completed', 'cancelled'))
    );
    PRINT N'Đã tạo bảng orders.';
END
ELSE
BEGIN
    PRINT N'Bảng orders đã tồn tại.';
END
GO

-- ----------------------------------------------------------------------------
-- Khối 3: Tạo bảng order_items (Lưu các mặt hàng chi tiết trong đơn hàng)
-- Chú ý: Cột product_id chỉ lưu ID tham chiếu phục vụ truy vấn nghiệp vụ qua API,
-- tuyệt đối KHÔNG tạo Foreign Key sang cơ sở dữ liệu của dịch vụ khác.
-- ----------------------------------------------------------------------------
IF OBJECT_ID('dbo.order_items', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.order_items (
        id INT PRIMARY KEY IDENTITY(1,1),
        order_id INT NOT NULL,
        product_id INT NOT NULL,
        product_name NVARCHAR(255) NOT NULL,
        quantity INT NOT NULL,
        unit_price DECIMAL(10,2) NOT NULL,
        total_price DECIMAL(10,2) NOT NULL,
        CONSTRAINT FK_order_items_orders FOREIGN KEY (order_id) 
            REFERENCES dbo.orders(id) ON DELETE CASCADE,
        CONSTRAINT CK_order_items_quantity CHECK (quantity > 0)
    );
    PRINT N'Đã tạo bảng order_items.';
END
ELSE
BEGIN
    PRINT N'Bảng order_items đã tồn tại.';
END
GO

-- ----------------------------------------------------------------------------
-- Khối 4: Tạo chỉ mục (Nonclustered Index) trên order_items(order_id)
-- Giúp tối ưu hóa tốc độ truy vấn danh sách mặt hàng theo mã đơn hàng.
-- ----------------------------------------------------------------------------
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes 
    WHERE name = 'IX_order_items_order_id' AND object_id = OBJECT_ID('dbo.order_items')
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_order_items_order_id ON dbo.order_items(order_id);
    PRINT N'Đã tạo chỉ mục IX_order_items_order_id.';
END
ELSE
BEGIN
    PRINT N'Chỉ mục IX_order_items_order_id đã tồn tại.';
END
GO

-- ----------------------------------------------------------------------------
-- Khối 5: Chèn dữ liệu mẫu (Seed Data)
-- Chỉ thực hiện chèn dữ liệu mẫu khi bảng orders hoàn toàn trống.
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.orders)
BEGIN
    -- Đơn hàng 1: Khách hàng Nguyễn Văn An (Trạng thái: completed)
    DECLARE @OrderId1 INT;
    INSERT INTO dbo.orders (customer_name, customer_email, total_amount, status, created_at, updated_at)
    VALUES (N'Nguyễn Văn An', 'nguyenvanan@example.com', 1500000.00, 'completed', SYSDATETIME(), SYSDATETIME());
    SET @OrderId1 = SCOPE_IDENTITY();

    INSERT INTO dbo.order_items (order_id, product_id, product_name, quantity, unit_price, total_price)
    VALUES 
        (@OrderId1, 1, N'Bàn phím cơ DareU EK87', 2, 500000.00, 1000000.00),
        (@OrderId1, 2, N'Chuột không dây Logitech G304', 1, 500000.00, 500000.00);

    -- Đơn hàng 2: Khách hàng Trần Thị Bích (Trạng thái: pending)
    DECLARE @OrderId2 INT;
    INSERT INTO dbo.orders (customer_name, customer_email, total_amount, status, created_at, updated_at)
    VALUES (N'Trần Thị Bích', 'bich.tran@example.com', 750000.50, 'pending', SYSDATETIME(), SYSDATETIME());
    SET @OrderId2 = SCOPE_IDENTITY();

    INSERT INTO dbo.order_items (order_id, product_id, product_name, quantity, unit_price, total_price)
    VALUES 
        (@OrderId2, 3, N'Tai nghe Gaming Kingston HyperX', 1, 750000.50, 750000.50);

    -- Đơn hàng 3: Khách hàng Lê Hoàng Long (Trạng thái: cancelled)
    DECLARE @OrderId3 INT;
    INSERT INTO dbo.orders (customer_name, customer_email, total_amount, status, created_at, updated_at)
    VALUES (N'Lê Hoàng Long', 'long.le@example.com', 2100000.00, 'cancelled', SYSDATETIME(), SYSDATETIME());
    SET @OrderId3 = SCOPE_IDENTITY();

    INSERT INTO dbo.order_items (order_id, product_id, product_name, quantity, unit_price, total_price)
    VALUES 
        (@OrderId3, 1, N'Bàn phím cơ DareU EK87', 1, 500000.00, 500000.00),
        (@OrderId3, 4, N'Màn hình Dell 24 inch', 1, 1600000.00, 1600000.00);

    PRINT N'Đã chèn dữ liệu mẫu thành công vào bảng orders và order_items.';
END
ELSE
BEGIN
    PRINT N'Bảng orders đã có dữ liệu, bỏ qua bước chèn mẫu.';
END
GO
