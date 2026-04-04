import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';

interface TransactionFilter {
  page?: string;
  limit?: string;
  startDate?: string;
  endDate?: string;
  transactionType?: string;
  categoryId?: string;
}

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

  async findAll(userId: string, filter?: TransactionFilter) {
    const page = filter?.page ? parseInt(filter.page) : 1;
    const limit = filter?.limit ? parseInt(filter.limit) : 20;
    const skip = (page - 1) * limit;

    const whereClause: any = { userId };

    if (filter?.startDate && filter?.endDate) {
      whereClause.transactedAt = {
        gte: new Date(filter.startDate as string),
        lte: new Date(filter.endDate as string),
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

  private async calculatePeriodSummary(
    userId: string,
    month: number,
    year: number,
  ) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    const transactions = await this.prisma.transaction.findMany({
      where: {
        userId,
        transactedAt: { gte: startDate, lte: endDate },
      },
    });

    return transactions.reduce(
      (acc: { income: number; expense: number }, curr) => {
        const amount = Number(curr.amount);
        if (curr.transactionType === 'income') acc.income += amount;
        else acc.expense += amount;
        return acc;
      },
      { income: 0, expense: 0 },
    );
  }

  private calculateTrend(current: number, previous: number) {
    // Both zero → no meaningful trend to show
    if (previous === 0 && current === 0) {
      return { value: 0, isPositive: true, noData: true };
    }
    // Previous was zero but now there is data → brand-new activity
    if (previous === 0) {
      return { value: 100, isPositive: current > 0, noData: false };
    }
    const diff = current - previous;
    // Use Math.abs(previous) so negative balances produce a correct positive percentage
    const percentage = Math.round((Math.abs(diff) / Math.abs(previous)) * 100);
    return {
      value: percentage,
      isPositive: diff >= 0,
      noData: false,
    };
  }

  async getSummary(userId: string, month: number, year: number) {
    const currentSummary = await this.calculatePeriodSummary(
      userId,
      month,
      year,
    );

    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const prevSummary = await this.calculatePeriodSummary(
      userId,
      prevMonth,
      prevYear,
    );

    const currentBalance = currentSummary.income - currentSummary.expense;
    const prevBalance = prevSummary.income - prevSummary.expense;

    return {
      month,
      year,
      income: currentSummary.income,
      incomeTrend: this.calculateTrend(
        currentSummary.income,
        prevSummary.income,
      ),
      expense: currentSummary.expense,
      expenseTrend: this.calculateTrend(
        currentSummary.expense,
        prevSummary.expense,
      ),
      balance: currentBalance,
      balanceTrend: this.calculateTrend(currentBalance, prevBalance),
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

    const categorySummary = transactions.reduce(
      (
        acc: Record<string, { name: string; value: number; color: string }>,
        curr,
      ) => {
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
      },
      {},
    );

    return Object.values(categorySummary).sort(
      (a: { value: number }, b: { value: number }) => b.value - a.value,
    );
  }
}
