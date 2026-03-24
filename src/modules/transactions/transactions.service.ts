import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateTransactionDto) {
    return this.prisma.transaction.create({
      data: {
        userId,
        categoryId: dto.categoryId,
        amount: dto.amount,
        transactionType: dto.transactionType,
        merchant: dto.merchant,
        note: dto.note,
        source: 'manual',
        transactedAt: new Date(dto.transactedAt),
      },
    });
  }

  async findAll(userId: string, filter?: any) {
    const page = filter?.page ? parseInt(filter.page) : 1;
    const limit = filter?.limit ? parseInt(filter.limit) : 20;
    const skip = (page - 1) * limit;

    const whereClause: any = { userId };

    if (filter?.startDate && filter?.endDate) {
      whereClause.transactedAt = {
        gte: new Date(filter.startDate),
        lte: new Date(filter.endDate),
      };
    }
    if (filter?.transactionType) {
      whereClause.transactionType = filter.transactionType;
    }
    if (filter?.categoryId) {
      whereClause.categoryId = filter.categoryId;
    }

    const [data, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { transactedAt: 'desc' },
        include: { category: true },
      }),
      this.prisma.transaction.count({ where: whereClause }),
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

  async update(userId: string, id: string, dto: UpdateTransactionDto) {
    const tx = await this.prisma.transaction.findFirst({
      where: { id, userId },
    });
    if (!tx) throw new NotFoundException('Transaction not found');

    const data: any = { ...dto };
    if (dto.transactedAt) data.transactedAt = new Date(dto.transactedAt);

    return this.prisma.transaction.update({
      where: { id },
      data,
    });
  }

  async remove(id: string, userId: string): Promise<void> {
    await this.prisma.transaction.delete({
      where: { id, userId },
    });
  }

  async removeMany(ids: string[], userId: string): Promise<void> {
    await this.prisma.transaction.deleteMany({
      where: {
        id: { in: ids },
        userId,
      },
    });
  }

  async getSummary(userId: string, month: number, year: number) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    const transactions = await this.prisma.transaction.findMany({
      where: {
        userId,
        transactedAt: { gte: startDate, lte: endDate },
      },
    });

    const summary = transactions.reduce(
      (acc: any, curr: any) => {
        const amount = Number(curr.amount);
        if (curr.transactionType === 'income') acc.income += amount;
        else acc.expense += amount;
        return acc;
      },
      { income: 0, expense: 0 },
    );

    return {
      month,
      year,
      income: summary.income,
      expense: summary.expense,
      balance: summary.income - summary.expense,
    };
  }

  async getCategorySummary(userId: string, month: number, year: number) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    const transactions = await this.prisma.transaction.findMany({
      where: {
        userId,
        transactionType: 'expense',
        transactedAt: { gte: startDate, lte: endDate },
      },
      include: { category: true },
    });

    const categorySummary = transactions.reduce((acc: any, curr: any) => {
      const catName = curr.category?.name || 'Lainnya';
      const amount = Number(curr.amount);

      if (!acc[catName]) {
        acc[catName] = {
          name: catName,
          value: 0,
          color: curr.category?.color || '#94a3b8',
        };
      }
      acc[catName].value += amount;
      return acc;
    }, {});

    return Object.values(categorySummary).sort(
      (a: any, b: any) => b.value - a.value,
    );
  }
}
