import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('notifications')
@Controller({ version: '1', path: 'notifications' })
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Post('token')
  @ApiOperation({ summary: 'Register FCM device token' })
  async registerToken(@Request() req: any, @Body() body: { token: string }) {
    await this.notificationService.saveToken(req.user.id, body.token);
    return { success: true };
  }
}
