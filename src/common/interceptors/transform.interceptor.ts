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
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  Response<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<Response<T>> {
    const response = context.switchToHttp().getResponse<FastifyReply>();

    return next.handle().pipe(
      map((data: any) => {
        // Skip wrapping if it's already a Response-like object (e.g. from an error or another interceptor)
        // or if it's a redirect object (has url property)
        if (
          data &&
          typeof data === 'object' &&
          ('url' in data || ('success' in data && 'data' in data))
        ) {
          return data;
        }

        // Also skip wrapping if the status code is already set to a redirect (3xx)
        const statusCode = response.statusCode;
        if (statusCode >= 300 && statusCode < 400) {
          return data;
        }

        return {
          success: true,
          data,
        } as Response<T>;
      }),
    );
  }
}
