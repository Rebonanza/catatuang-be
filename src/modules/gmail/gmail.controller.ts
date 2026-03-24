import {
  Controller,
  Post,
  Delete,
  Get,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { GmailService } from './gmail.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import * as RequestTypes from '../../common/interfaces/request.interface';
import { WebhookGuard } from '../../common/guards/webhook.guard';

@Controller({ version: '1', path: 'gmail' })
export class GmailController {
  constructor(private readonly gmailService: GmailService) {}

  @UseGuards(JwtAuthGuard)
  @Post('connect')
  @HttpCode(HttpStatus.OK)
  async connect(@Req() req: RequestTypes.AuthenticatedRequest) {
    return this.gmailService.startWatch(req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('disconnect')
  @HttpCode(HttpStatus.OK)
  async disconnect(@Req() req: RequestTypes.AuthenticatedRequest) {
    return this.gmailService.stopWatch(req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('account')
  @HttpCode(HttpStatus.OK)
  async deleteAccount(@Req() req: RequestTypes.AuthenticatedRequest) {
    return this.gmailService.deleteToken(req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get('status')
  async status(@Req() req: RequestTypes.AuthenticatedRequest) {
    return this.gmailService.getStatus(req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post('sync')
  @HttpCode(HttpStatus.OK)
  async sync(@Req() req: RequestTypes.AuthenticatedRequest) {
    return this.gmailService.syncNow(req.user.sub);
  }

  @UseGuards(WebhookGuard)
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async webhook(@Body() body: { message?: { data?: string } }) {
    // GCP Pub/Sub sends payload here
    return this.gmailService.handleWebhook(body);
  }
}
