import {
  ConflictException,
  Injectable,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { TransactionType } from '../../common/constants/transaction.constant';
import { Prisma } from '@prisma/client';
import { Profile } from 'passport-google-oauth20';
import { Logger } from '@nestjs/common';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  private readonly defaultCategories = [
    { name: 'Makan & Minum', type: TransactionType.EXPENSE, icon: 'utensils' },
    { name: 'Transport', type: TransactionType.EXPENSE, icon: 'car' },
    { name: 'Belanja', type: TransactionType.EXPENSE, icon: 'shopping-bag' },
    { name: 'Tagihan & Utilitas', type: TransactionType.EXPENSE, icon: 'zap' },
    { name: 'Kesehatan', type: TransactionType.EXPENSE, icon: 'heart-pulse' },
    { name: 'Hiburan', type: TransactionType.EXPENSE, icon: 'tv' },
    { name: 'Pendidikan', type: TransactionType.EXPENSE, icon: 'book-open' },
    {
      name: 'Lainnya (Pengeluaran)',
      type: TransactionType.EXPENSE,
      icon: 'circle-ellipsis',
    },
    { name: 'Gaji', type: TransactionType.INCOME, icon: 'briefcase' },
    {
      name: 'Transfer Masuk',
      type: TransactionType.INCOME,
      icon: 'arrow-down-circle',
    },
    {
      name: 'Lainnya (Pemasukan)',
      type: TransactionType.INCOME,
      icon: 'circle-ellipsis',
    },
  ];

  async register(dto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existingUser) {
      throw new ConflictException({
        code: 'VALIDATION_ERROR',
        message: 'Email sudah terdaftar',
        details: [],
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

        const categoriesData = this.defaultCategories.map((cat) => ({
          userId: user.id,
          name: cat.name,
          icon: cat.icon,
          transactionType: cat.type,
          isDefault: true,
        }));

        await tx.category.createMany({
          data: categoriesData,
        });

        return this.generateTokens(user.id, tx);
      },
      { maxWait: 5000, timeout: 10000 },
    );
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Email atau password salah',
        details: [],
      });
    }

    const isMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Email atau password salah',
        details: [],
      });
    }

    return this.generateTokens(user.id);
  }

  async refresh(refreshToken: string) {
    const tokenHash = crypto
      .createHash('sha256')
      .update(refreshToken)
      .digest('hex');

    const tokenRecord = await this.prisma.refreshToken.findFirst({
      where: { tokenHash },
    });

    if (!tokenRecord) {
      throw new UnauthorizedException('Token tidak valid');
    }

    if (tokenRecord.isRevoked || tokenRecord.expiresAt < new Date()) {
      throw new UnauthorizedException('Token expired');
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
  }

  async logout(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, isRevoked: false },
      data: { isRevoked: true },
    });
    return { success: true };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true, googleId: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.passwordHash) {
      // Account already has a password — current password is required
      if (!dto.currentPassword) {
        throw new UnprocessableEntityException({
          code: 'VALIDATION_ERROR',
          message: 'Current password is required',
          details: [],
        });
      }
      const isMatch = await bcrypt.compare(
        dto.currentPassword,
        user.passwordHash,
      );
      if (!isMatch) {
        throw new UnauthorizedException({
          code: 'UNAUTHORIZED',
          message: 'Current password is incorrect',
          details: [],
        });
      }
    }
    // Google-only account: no passwordHash → skip current-password check,
    // just set the new password (enables email+password login going forward)

    const newHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    // Revoke all refresh tokens → force re-login on all devices
    await this.prisma.refreshToken.updateMany({
      where: { userId, isRevoked: false },
      data: { isRevoked: true },
    });

    return { success: true };
  }

  async getMe(userId: string) {
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
      throw new UnauthorizedException('User not found');
    }
    const { passwordHash, ...result } = user;
    return {
      success: true,
      data: {
        ...result,
        hasPassword: !!passwordHash,
      },
    };
  }

  async googleAuthCallback(
    profile: Profile,
    gmailAccessToken: string,
    gmailRefreshToken: string | undefined,
  ) {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      throw new UnauthorizedException('Email not found in Google profile');
    }
    const name = profile.displayName;
    const avatarUrl =
      profile.photos && profile.photos.length > 0
        ? profile.photos[0].value
        : null;
    const googleId = profile.id;

    let user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      const newUser = await this.prisma.user.create({
        data: {
          email,
          name,
          googleId,
          avatarUrl,
        },
      });
      user = newUser;

      const categoriesData = this.defaultCategories.map((cat) => ({
        userId: newUser.id,
        name: cat.name,
        icon: cat.icon,
        transactionType: cat.type,
        isDefault: true,
      }));

      await this.prisma.category.createMany({
        data: categoriesData,
      });
    } else if (!user.googleId || user.avatarUrl !== avatarUrl) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { googleId, avatarUrl },
      });
    }

    const aesKey = crypto
      .createHash('sha256')
      .update(this.configService.get<string>('JWT_SECRET') || 'secret')
      .digest();
    const iv = crypto.randomBytes(16);

    const encrypt = (text: string) => {
      if (!text) return '';
      const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
      let enc = cipher.update(text, 'utf8', 'hex');
      enc += cipher.final('hex');
      const authTag = cipher.getAuthTag().toString('hex');
      return `${iv.toString('hex')}:${authTag}:${enc}`;
    };

    if (gmailAccessToken) {
      const encAccess = encrypt(gmailAccessToken);
      const encRefresh = gmailRefreshToken ? encrypt(gmailRefreshToken) : '';
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1);

      await this.prisma.gmailToken.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          accessTokenEncrypted: encAccess,
          refreshTokenEncrypted: encRefresh,
          tokenExpiresAt: expiresAt,
        },
        update: {
          accessTokenEncrypted: encAccess,
          ...(encRefresh ? { refreshTokenEncrypted: encRefresh } : {}),
          tokenExpiresAt: expiresAt,
        },
      });
    }

    return this.generateTokens(user.id);
  }

  private async generateTokens(
    userId: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
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
