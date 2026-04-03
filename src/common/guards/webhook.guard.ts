import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FastifyRequest } from 'fastify';
import { OAuth2Client } from 'google-auth-library';

@Injectable()
export class WebhookGuard implements CanActivate {
  private readonly logger = new Logger(WebhookGuard.name);
  private readonly oauth2Client = new OAuth2Client();

  constructor(private readonly configService: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const authHeader = request.headers['authorization'];
    const userAgent = request.headers['user-agent'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      this.logger.warn(
        `Missing or invalid Authorization header. Source: ${userAgent}`,
      );
      throw new UnauthorizedException(
        'Missing or invalid Authorization header',
      );
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      throw new UnauthorizedException('Missing token');
    }

    try {
      const audience = this.configService.get<string>('GMAIL_WEBHOOK_AUDIENCE');

      const ticket = await this.oauth2Client.verifyIdToken({
        idToken: token,
        audience: audience,
      });

      const payload = ticket.getPayload();
      if (!payload) {
        throw new UnauthorizedException('Invalid token payload');
      }

      if (
        payload.iss !== 'https://accounts.google.com' &&
        payload.iss !== 'accounts.google.com'
      ) {
        throw new UnauthorizedException('Invalid token issuer');
      }

      return true;
    } catch (error: unknown) {
      this.logger.error('Failed to verify Google OIDC token', error);
      throw new UnauthorizedException('Invalid Google OIDC token');
    }
  }
}
