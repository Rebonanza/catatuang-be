import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  Get,
  Redirect,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GoogleAuthGuard } from '../../common/guards/google-auth.guard';
import type {
  AuthenticatedRequest,
  GoogleAuthenticatedRequest,
} from '../../common/interfaces/request.interface';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Req() req: AuthenticatedRequest) {
    return this.authService.logout(req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMe(@Req() req: AuthenticatedRequest) {
    return this.authService.getMe(req.user.sub);
  }

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  async googleAuth() {
    // Handled by Passport
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  @Redirect()
  googleAuthRedirect(@Req() req: GoogleAuthenticatedRequest) {
    console.log('Google Auth Redirect reached', { user: !!req.user });
    const url = process.env.FRONTEND_URL || 'http://localhost:5173';
    if (!req.user) {
      console.error('No user found in request');
      return {
        url: `${url}/login?error=no_user`,
        statusCode: 302,
      };
    }
    const { accessToken, refreshToken } = req.user;
    console.log('Redirecting to frontend with tokens');
    return {
      url: `${url}/auth/callback?access_token=${accessToken}&refresh_token=${refreshToken}`,
      statusCode: 302,
    };
  }
}
