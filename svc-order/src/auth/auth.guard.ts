import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import type { Request } from 'express';

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: unknown }>();
    const authorization = request.headers.authorization;

    // Kiểm tra sự tồn tại của header Authorization
    if (!authorization) {
      throw new UnauthorizedException('Yêu cầu header Authorization với Bearer token');
    }

    const [scheme, token, extra] = authorization.split(' ');
    if (scheme !== 'Bearer' || !token || extra !== undefined) {
      throw new UnauthorizedException('Header Authorization phải có định dạng: Bearer <token>');
    }

    const authServiceUrl = process.env.AUTH_SERVICE_URL ?? 'http://localhost:3004';

    try {
      // Chuyển tiếp Authorization header sang svc-auth GET /auth/profile với timeout 3s
      // Tuân thủ SOA: Không giải mã JWT tại đây, không truy vấn CSDL của svc-auth
      const response = await axios.get(`${authServiceUrl}/auth/profile`, {
        headers: {
          Authorization: authorization,
        },
        timeout: 3000,
      });

      // Gắn dữ liệu phản hồi từ svc-auth vào req.user
      request.user = response.data;
      return true;
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const axiosErr = error as AxiosError;

        // Nếu svc-auth trả về mã lỗi HTTP (401 Unauthorized do token sai/hết hạn)
        if (axiosErr.response) {
          const status = axiosErr.response.status;
          if (status === 401 || status === 403) {
            throw new UnauthorizedException('Token xác thực không hợp lệ hoặc đã hết hạn');
          }
          throw new UnauthorizedException('Xác thực thất bại từ dịch vụ auth');
        }

        // Lỗi kết nối, không phản hồi hoặc timeout (ECONNREFUSED, ETIMEDOUT, ECONNABORTED)
        this.logger.error(
          `Không thể kết nối tới svc-auth tại ${authServiceUrl}: ${axiosErr.message}`,
        );
        throw new ServiceUnavailableException(
          'Dịch vụ xác thực (svc-auth) hiện không khả dụng. Vui lòng kiểm tra svc-auth đang chạy tại cổng 3004',
        );
      }

      this.logger.error(`Lỗi không xác định khi xác thực: ${String(error)}`);
      throw new ServiceUnavailableException('Dịch vụ xác thực không khả dụng');
    }
  }
}
