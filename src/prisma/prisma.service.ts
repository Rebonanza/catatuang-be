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
      connectionLimit: 20,
      connectTimeout: 5000, // 5s per attempt
      ssl: useSsl ? { rejectUnauthorized: true } : undefined,
    });
    super({ adapter });
  }

  onModuleInit() {
    void this.$connect().catch((error: unknown) => {
      this.logger.error('Failed to connect to database', error);
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
