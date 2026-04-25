import {
  Controller,
  Post,
  Delete,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { GmailService } from './gmail.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { WebhookGuard } from '../../common/guards/webhook.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  GmailActionResponse,
  GmailStatusResponse,
  GmailSyncResponse,
  GmailWatchResponse,
} from './interfaces/gmail-response.interface';

@Controller({ version: '1', path: 'gmail' })
export class GmailController {
  constructor(private readonly gmailService: GmailService) {}

  @UseGuards(JwtAuthGuard)
  @Post('connect')
  @HttpCode(HttpStatus.OK)
  async connect(
    @CurrentUser('id') userId: string,
  ): Promise<GmailWatchResponse> {
    return this.gmailService.startWatch(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('disconnect')
  @HttpCode(HttpStatus.OK)
  async disconnect(
    @CurrentUser('id') userId: string,
  ): Promise<GmailActionResponse> {
    return this.gmailService.stopWatch(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('account')
  @HttpCode(HttpStatus.OK)
  async deleteAccount(
    @CurrentUser('id') userId: string,
  ): Promise<GmailActionResponse> {
    return this.gmailService.deleteToken(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('status')
  async status(
    @CurrentUser('id') userId: string,
  ): Promise<GmailStatusResponse> {
    return this.gmailService.getStatus(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('sync')
  @HttpCode(HttpStatus.OK)
  async sync(@CurrentUser('id') userId: string): Promise<GmailSyncResponse> {
    return this.gmailService.syncNow(userId);
  }

  @UseGuards(WebhookGuard)
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Body() body: { message?: { data?: string } },
  ): Promise<GmailActionResponse> {
    // GCP Pub/Sub sends payload here
    return this.gmailService.handleWebhook(body);
  }
}
