import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GmailService } from './gmail.service';
import { GmailController } from './gmail.controller';
import { GmailParserService } from './gmail-parser.service';

@Module({
  imports: [ConfigModule],
  controllers: [GmailController],
  providers: [GmailService, GmailParserService],
})
export class GmailModule {}
