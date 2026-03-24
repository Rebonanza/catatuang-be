import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateCategoryDto) {
    return this.prisma.category.create({
      data: {
        userId,
        name: dto.name,
        icon: dto.icon,
        color: dto.color,
        transactionType: dto.transactionType,
        isDefault: false,
      },
    });
  }

  async findAll(userId: string, filter?: { page?: string; limit?: string }) {
    const page = filter?.page ? parseInt(filter.page) : 1;
    const limit = filter?.limit ? parseInt(filter.limit) : 20;
    const skip = (page - 1) * limit;

    const whereClause = { userId };

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
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async update(userId: string, id: string, dto: UpdateCategoryDto) {
    const category = await this.prisma.category.findFirst({
      where: { id, userId },
    });
    if (!category) throw new NotFoundException('Category not found');

    return this.prisma.category.update({
      where: { id },
      data: dto,
    });
  }

  async remove(userId: string, id: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, userId },
    });
    if (!category) throw new NotFoundException('Category not found');
    if (category.isDefault)
      throw new BadRequestException('Cannot delete default category');

    return this.prisma.$transaction(async (tx) => {
      // Nullify categoryId in transactions
      await tx.transaction.updateMany({
        where: { categoryId: id },
        data: { categoryId: null },
      });

      // Delete the category
      return tx.category.delete({ where: { id } });
    });
  }
}
