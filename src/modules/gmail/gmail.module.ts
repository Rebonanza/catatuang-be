import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GmailService } from './gmail.service';
import { GmailController } from './gmail.controller';
import { GmailParserService } from './gmail-parser.service';
import { AiParser } from './parsers/ai.parser';
import { NotificationModule } from '../notifications/notification.module';
import { CommonModule } from '../../common/common.module';

@Module({
  imports: [ConfigModule, NotificationModule, CommonModule],
  controllers: [GmailController],
  providers: [GmailService, GmailParserService, AiParser],
})
export class GmailModule {}
