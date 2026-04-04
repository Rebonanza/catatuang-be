import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let code = 'INTERNAL_SERVER_ERROR';
    let details: unknown[] = [];

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse() as unknown;
      const resObj =
        typeof res === 'object' && res !== null
          ? (res as Record<string, unknown>)
          : {};

      message =
        typeof res === 'string' ? res : (resObj.message as string) || message;
      code = (resObj.error as string) || this.getErrorCode(status);
      details =
        resObj.message && Array.isArray(resObj.message) ? resObj.message : [];
    } else {
      this.logger.error(
        `Unhandled exception: ${exception instanceof Error ? exception.message : String(exception)}`,
        exception instanceof Error ? exception.stack : '',
      );
    }

    const errorResponse = {
      success: false,
      error: {
        code: code.toUpperCase().replace(/\s+/g, '_'),
        message: Array.isArray(message) ? (message[0] as string) : message,
        details,
        timestamp: new Date().toISOString(),
        path: request.url,
      },
    };

    return response.status(status).send(errorResponse);
  }

  private getErrorCode(status: number): string {
    switch (status) {
      case 400:
        return 'BAD_REQUEST';
      case 401:
        return 'UNAUTHORIZED';
      case 403:
        return 'FORBIDDEN';
      case 404:
        return 'NOT_FOUND';
      case 409:
        return 'CONFLICT';
      case 422:
        return 'UNPROCESSABLE_ENTITY';
      case 429:
        return 'TOO_MANY_REQUESTS';
      default:
        return 'INTERNAL_SERVER_ERROR';
    }
  }
}
