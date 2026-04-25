import {
  ConflictException,
  Injectable,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../../common/services/encryption.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { Prisma } from '@prisma/client';
import { Profile } from 'passport-google-oauth20';
import { Logger } from '@nestjs/common';
import { buildCategoriesData } from '../../common/constants/auth.constant';
import {
  TokenResponse,
  MeResponse,
} from './interfaces/auth-response.interface';
import { ApiResponse } from '../../common/interfaces/api-response.interface';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly encryptionService: EncryptionService,
  ) {}

  async register(dto: RegisterDto): Promise<TokenResponse> {
    try {
      const existingUser = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (existingUser) {
        throw new ConflictException({
          success: false,
          error: {
            code: 'CONFLICT_ERROR',
            message: 'Email sudah terdaftar',
            details: [],
          },
        });
      }

      const passwordHash = await bcrypt.hash(dto.password, 12);
      return this.prisma.$transaction(
        async (tx: Prisma.TransactionClient) => {
          const user = await tx.user.create({
            data: {
              email: dto.email,
              passwordHash,
              name: dto.name,
            },
          });

          await tx.category.createMany({
            data: buildCategoriesData(user.id),
          });

          return this.generateTokens(user.id, tx);
        },
        { maxWait: 5000, timeout: 10000 },
      );
    } catch (error: unknown) {
      if (error instanceof ConflictException) throw error;
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Register error: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new ConflictException({
        success: false,
        error: {
          code: 'CONFLICT_ERROR',
          message: 'Email sudah terdaftar',
          details: [],
        },
      });
    }
  }

  async login(dto: LoginDto): Promise<TokenResponse> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (!user || !user.passwordHash) {
        throw new UnauthorizedException({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Email atau password salah',
            details: [],
          },
        });
      }

      const isMatch = await bcrypt.compare(dto.password, user.passwordHash);
      if (!isMatch) {
        throw new UnauthorizedException({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Email atau password salah',
            details: [],
          },
        });
      }

      return this.generateTokens(user.id, this.prisma);
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) throw error;
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Login error: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new UnauthorizedException({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Terjadi kesalahan saat login',
          details: [],
        },
      });
    }
  }

  async refresh(refreshToken: string): Promise<TokenResponse> {
    try {
      const tokenHash = crypto
        .createHash('sha256')
        .update(refreshToken)
        .digest('hex');

      const tokenRecord = await this.prisma.refreshToken.findFirst({
        where: { tokenHash },
      });

      if (!tokenRecord) {
        throw new UnauthorizedException({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Token tidak valid',
            details: [],
          },
        });
      }

      if (tokenRecord.isRevoked || tokenRecord.expiresAt < new Date()) {
        throw new UnauthorizedException({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Token expired',
            details: [],
          },
        });
      }

      return this.prisma.$transaction(
        async (tx) => {
          await tx.refreshToken.update({
            where: { id: tokenRecord.id },
            data: { isRevoked: true },
          });
          return this.generateTokens(tokenRecord.userId, tx);
        },
        { maxWait: 5000, timeout: 10000 },
      );
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) throw error;
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Refresh error: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new UnauthorizedException({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Gagal memperbarui token',
          details: [],
        },
      });
    }
  }

  async logout(userId: string): Promise<ApiResponse> {
    try {
      await this.prisma.refreshToken.updateMany({
        where: { userId, isRevoked: false },
        data: { isRevoked: true },
      });
      return { success: true };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Logout error: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      return { success: false };
    }
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<ApiResponse> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { passwordHash: true, googleId: true },
      });

      if (!user) {
        throw new UnauthorizedException({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User tidak ditemukan',
            details: [],
          },
        });
      }

      if (user.passwordHash) {
        // Account already has a password — current password is required
        if (!dto.currentPassword) {
          throw new UnprocessableEntityException({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Password saat ini diperlukan',
              details: [],
            },
          });
        }
        const isMatch = await bcrypt.compare(
          dto.currentPassword,
          user.passwordHash,
        );
        if (!isMatch) {
          throw new UnauthorizedException({
            success: false,
            error: {
              code: 'UNAUTHORIZED',
              message: 'Password saat ini salah',
              details: [],
            },
          });
        }
      }

      const newHash = await bcrypt.hash(dto.newPassword, 12);
      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: userId },
          data: { passwordHash: newHash },
        });

        // Revoke all refresh tokens → force re-login on all devices
        await tx.refreshToken.updateMany({
          where: { userId, isRevoked: false },
          data: { isRevoked: true },
        });
      });

      return { success: true };
    } catch (error: unknown) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof UnprocessableEntityException
      )
        throw error;
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Change password error: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new UnprocessableEntityException({
        success: false,
        error: {
          code: 'UNPROCESSABLE_ENTITY',
          message: 'Gagal mengubah password',
          details: [],
        },
      });
    }
  }

  async getMe(userId: string): Promise<MeResponse> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          avatarUrl: true,
          passwordHash: true,
        },
      });
      if (!user) {
        throw new UnauthorizedException({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User tidak ditemukan',
            details: [],
          },
        });
      }
      const { passwordHash, ...result } = user;
      return {
        success: true,
        data: {
          ...result,
          hasPassword: !!passwordHash,
        },
      };
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) throw error;
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `GetMe error: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new UnauthorizedException({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Sesi tidak valid',
          details: [],
        },
      });
    }
  }

  async googleAuthCallback(
    profile: Profile,
    gmailAccessToken: string,
    gmailRefreshToken: string | undefined,
  ): Promise<TokenResponse> {
    try {
      const email = profile.emails?.[0]?.value;
      if (!email) {
        throw new UnauthorizedException({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Email tidak ditemukan di profil Google',
            details: [],
          },
        });
      }
      const name = profile.displayName;
      const avatarUrl =
        profile.photos && profile.photos.length > 0
          ? profile.photos[0].value
          : null;
      const googleId = profile.id;

      return this.prisma.$transaction(async (tx) => {
        let user = await tx.user.findUnique({ where: { email } });

        if (!user) {
          user = await tx.user.create({
            data: {
              email,
              name,
              googleId,
              avatarUrl,
            },
          });

          await tx.category.createMany({
            data: buildCategoriesData(user.id),
          });
        } else if (!user.googleId || user.avatarUrl !== avatarUrl) {
          user = await tx.user.update({
            where: { id: user.id },
            data: { googleId, avatarUrl },
          });
        }

        if (gmailAccessToken) {
          const encAccess = this.encryptionService.encrypt(gmailAccessToken);
          const encRefresh = gmailRefreshToken
            ? this.encryptionService.encrypt(gmailRefreshToken)
            : '';
          const expiresAt = new Date();
          expiresAt.setHours(expiresAt.getHours() + 1);

          await tx.gmailToken.upsert({
            where: { userId: user.id },
            create: {
              userId: user.id,
              email,
              accessTokenEncrypted: encAccess,
              refreshTokenEncrypted: encRefresh,
              tokenExpiresAt: expiresAt,
            },
            update: {
              email,
              accessTokenEncrypted: encAccess,
              ...(encRefresh ? { refreshTokenEncrypted: encRefresh } : {}),
              tokenExpiresAt: expiresAt,
            },
          });
        }

        return this.generateTokens(user.id, tx);
      });
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Google callback error: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new UnauthorizedException({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Gagal melakukan login via Google',
          details: [],
        },
      });
    }
  }

  private async generateTokens(
    userId: string,
    tx: Prisma.TransactionClient | PrismaService,
  ): Promise<TokenResponse> {
    const accessToken = this.jwtService.sign({ sub: userId });

    // Generate secure random string for refresh token
    const refreshToken = crypto.randomBytes(40).toString('hex');
    const tokenHash = crypto
      .createHash('sha256')
      .update(refreshToken)
      .digest('hex');

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await tx.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    });

    return {
      success: true,
      data: {
        accessToken,
        refreshToken,
      },
    };
  }
}
