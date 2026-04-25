import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RegisterTokenDto } from './dto/register-token.dto';
import { ApiResponse } from '../../common/interfaces/api-response.interface';
import { type AuthenticatedRequest } from '../../common/interfaces/request.interface';

@ApiTags('notifications')
@Controller({ version: '1', path: 'notifications' })
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Post('token')
  @ApiOperation({ summary: 'Register FCM device token' })
  async registerToken(
    @Request() req: AuthenticatedRequest,
    @Body() body: RegisterTokenDto,
  ): Promise<ApiResponse> {
    await this.notificationService.saveToken(req.user.id, body.token);
    return { success: true };
  }
}
