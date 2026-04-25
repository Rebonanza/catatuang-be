import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { ApiResponse } from '../../common/interfaces/api-response.interface';
import { User } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string): Promise<ApiResponse<UserResponseDto>> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        googleId: true,
        avatarUrl: true,
        createdAt: true,
        updatedAt: true,
        passwordHash: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      success: true,
      data: this.mapToResponseDto(user),
    };
  }

  async updateProfile(
    userId: string,
    dto: UpdateUserDto,
  ): Promise<ApiResponse<UserResponseDto>> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: dto,
      select: {
        id: true,
        email: true,
        name: true,
        googleId: true,
        avatarUrl: true,
        createdAt: true,
        updatedAt: true,
        passwordHash: true,
      },
    });

    return {
      success: true,
      data: this.mapToResponseDto(updatedUser),
    };
  }

  private mapToResponseDto(user: User): UserResponseDto {
    const { passwordHash, ...result } = user;
    return {
      ...result,
      hasPassword: !!passwordHash,
    };
  }
}
