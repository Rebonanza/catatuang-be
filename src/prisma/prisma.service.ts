import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(private configService: ConfigService) {
    const host = configService.get<string>('DB_HOST', '127.0.0.1');
    const port = parseInt(configService.get<string>('DB_PORT', '3306'), 10);
    const database = configService.get<string>('DB_DATABASE', 'catatuang');
    const useSsl = configService.get<string>('DB_SSL', 'false') === 'true';

    const adapter = new PrismaMariaDb({
      host,
      user: configService.get<string>('DB_USERNAME', 'root'),
      password: configService.get<string>('DB_PASSWORD', ''),
      database,
      port,
      connectionLimit: 10,
      connectTimeout: 10000,
      ssl: useSsl ? { rejectUnauthorized: true } : undefined,
    });
    super({ adapter });

    this.logger.log(
      `Database config: host=${host}, port=${port}, database=${database}, ssl=${String(useSsl)}`,
    );
  }

  async onModuleInit() {
    try {
      this.logger.log('Connecting to database...');
      await this.$connect();
      this.logger.log('Database connection established');
    } catch (error) {
      this.logger.error('Failed to connect to database', error);
      // Don't throw, let the app start but log the error
      // Or we can throw to prevent the app from starting in a broken state
      // If it's a critical connection, throwing is better for Fly.io to know it failed
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
