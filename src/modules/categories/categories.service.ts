import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CategoryResponseDto } from './dto/category-response.dto';
import { ApiResponse } from '../../common/interfaces/api-response.interface';
import { Prisma, Category } from '@prisma/client';
import { TransactionType } from '../../common/constants/transaction.constant';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    dto: CreateCategoryDto,
  ): Promise<ApiResponse<CategoryResponseDto>> {
    const category = await this.prisma.category.create({
      data: {
        userId,
        name: dto.name,
        icon: dto.icon,
        color: dto.color,
        transactionType: dto.transactionType,
        isDefault: false,
      },
    });

    return {
      success: true,
      data: this.mapToResponseDto(category),
    };
  }

  async findAll(
    userId: string,
    filter?: { page?: string; limit?: string },
  ): Promise<ApiResponse<CategoryResponseDto[]>> {
    const page = filter?.page ? parseInt(filter.page) : 1;
    const limit = filter?.limit ? parseInt(filter.limit) : 20;
    const skip = (page - 1) * limit;

    const whereClause: Prisma.CategoryWhereInput = { userId };

    const [data, total] = await Promise.all([
      this.prisma.category.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.category.count({ where: whereClause }),
    ]);

    return {
      success: true,
      data: data.map((item) => this.mapToResponseDto(item)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateCategoryDto,
  ): Promise<ApiResponse<CategoryResponseDto>> {
    const category = await this.prisma.category.findFirst({
      where: { id, userId },
    });
    if (!category) throw new NotFoundException('Category not found');

    const updatedCategory = await this.prisma.category.update({
      where: { id },
      data: dto,
    });

    return {
      success: true,
      data: this.mapToResponseDto(updatedCategory),
    };
  }

  async remove(userId: string, id: string): Promise<ApiResponse> {
    const category = await this.prisma.category.findFirst({
      where: { id, userId },
    });
    if (!category) throw new NotFoundException('Category not found');
    if (category.isDefault)
      throw new BadRequestException('Cannot delete default category');

    await this.prisma.$transaction(
      async (tx) => {
        // Nullify categoryId in transactions
        await tx.transaction.updateMany({
          where: { categoryId: id },
          data: { categoryId: null },
        });

        // Delete the category
        await tx.category.delete({ where: { id } });
      },
      { maxWait: 5000, timeout: 10000 },
    );

    return { success: true };
  }

  private mapToResponseDto(category: Category): CategoryResponseDto {
    return {
      id: category.id,
      userId: category.userId,
      name: category.name,
      icon: category.icon,
      color: category.color,
      transactionType: category.transactionType as TransactionType,
      isDefault: category.isDefault,
      createdAt: category.createdAt,
    };
  }
}
