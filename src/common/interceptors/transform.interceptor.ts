import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import type { FastifyReply } from 'fastify';

export interface Response<T> {
  success: boolean;
  data: T;
  meta?: unknown;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  Response<T>
> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const httpContext = context.switchToHttp();
    const response = httpContext.getResponse<FastifyReply>();

    return next.handle().pipe(
      map((data: unknown): any => {
        // Skip wrapping for redirects (status 3xx)
        // OR if it's a redirect configuration object (has url property)
        if (
          (response.statusCode >= 300 && response.statusCode < 400) ||
          (data && typeof data === 'object' && 'url' in data)
        ) {
          return data;
        }

        // Skip wrapping if it's already a Response-like object (e.g. from an error or another interceptor)
        if (
          data &&
          typeof data === 'object' &&
          'success' in data &&
          'data' in data
        ) {
          return data;
        }

        // Handle pagination meta if present
        if (
          data &&
          typeof data === 'object' &&
          'meta' in data &&
          'data' in data
        ) {
          const paginated = data as { data: T; meta: unknown };
          return {
            success: true,
            data: paginated.data,
            meta: paginated.meta,
          };
        }

        return {
          success: true,
          data: data as T,
        };
      }),
    );
  }
}
