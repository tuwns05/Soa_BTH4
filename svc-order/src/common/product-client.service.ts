import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import axios, { AxiosError } from 'axios';

export interface ProductResponse {
  id: number;
  name: string;
  description: string | null;
  price: number;
  quantity: number;
  created_at?: string;
  updated_at?: string;
}

@Injectable()
export class ProductClientService {
  private readonly logger = new Logger(ProductClientService.name);

  /**
   * Gọi API svc-product để lấy thông tin chi tiết và số lượng tồn kho của sản phẩm
   * @param productId ID sản phẩm cần kiểm tra
   * @param authorizationHeader Header Authorization (Bearer token) chuyển tiếp từ client
   */
  async getProduct(
    productId: number,
    authorizationHeader: string,
  ): Promise<ProductResponse> {
    const productServiceUrl =
      process.env.PRODUCT_SERVICE_URL ?? 'http://localhost:3005';

    try {
      const response = await axios.get<ProductResponse>(
        `${productServiceUrl}/products/${productId}`,
        {
          headers: {
            Authorization: authorizationHeader,
          },
          timeout: 3000,
        },
      );

      return response.data;
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const axiosErr = error as AxiosError;

        if (axiosErr.response) {
          const status = axiosErr.response.status;
          if (status === 404) {
            throw new NotFoundException(
              `Sản phẩm với ID ${productId} không tồn tại trong hệ thống`,
            );
          }
          if (status === 401 || status === 403) {
            throw new UnauthorizedException(
              'Xác thực không hợp lệ khi giao tiếp với dịch vụ sản phẩm',
            );
          }
          throw new ServiceUnavailableException(
            `Dịch vụ sản phẩm trả về lỗi HTTP ${status}`,
          );
        }

        this.logger.error(
          `Không thể kết nối đến svc-product (${productServiceUrl}): ${axiosErr.message}`,
        );
        throw new ServiceUnavailableException(
          'Dịch vụ sản phẩm (svc-product) hiện không khả dụng. Vui lòng kiểm tra svc-product đang chạy tại cổng 3005',
        );
      }

      this.logger.error(`Lỗi khi gọi svc-product: ${String(error)}`);
      throw new ServiceUnavailableException('Lỗi khi gọi dịch vụ sản phẩm');
    }
  }
}
