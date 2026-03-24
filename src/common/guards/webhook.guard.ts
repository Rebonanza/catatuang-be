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
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
  private readonly oauth2Client: any = new OAuth2Client();

  constructor(private readonly configService: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const authHeader: string | undefined = request.headers['authorization'];
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

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const ticket = await this.oauth2Client.verifyIdToken({
        idToken: token,
        audience: audience,
      });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const payload = ticket.getPayload();
      if (!payload) {
        throw new UnauthorizedException('Invalid token payload');
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (
        payload.iss !== 'https://accounts.google.com' &&
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        payload.iss !== 'accounts.google.com'
      ) {
        throw new UnauthorizedException('Invalid token issuer');
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      this.logger.debug(`Webhook verified for: ${payload.email}`);
      return true;
    } catch (error: unknown) {
      this.logger.error('Failed to verify Google OIDC token', error);
      throw new UnauthorizedException('Invalid Google OIDC token');
    }
  }
}
