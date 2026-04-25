import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { GetTransactionsFilterDto } from './dto/get-transactions-filter.dto';
import { TransactionResponseDto } from './dto/transaction-response.dto';
import { ApiResponse } from '../../common/interfaces/api-response.interface';
import { Prisma } from '@prisma/client';
import {
  ParseStatus,
  TransactionSource,
  TransactionType,
} from '../../common/constants/transaction.constant';

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    dto: CreateTransactionDto,
  ): Promise<ApiResponse<TransactionResponseDto>> {
    const transaction = await this.prisma.transaction.create({
      data: {
        userId,
        categoryId: dto.categoryId,
        amount: dto.amount,
        transactionType: dto.transactionType,
        merchant: dto.merchant,
        note: dto.note,
        source: TransactionSource.MANUAL,
        transactedAt: dto.transactedAt,
      },
      include: { category: true },
    });

    return {
      success: true,
      data: this.mapToResponseDto(transaction),
    };
  }

  async findAll(
    userId: string,
    filter?: GetTransactionsFilterDto,
  ): Promise<ApiResponse<TransactionResponseDto[]>> {
    const page = filter?.page ? parseInt(filter.page) : 1;
    const limit = filter?.limit ? parseInt(filter.limit) : 20;
    const skip = (page - 1) * limit;

    const whereClause: Prisma.TransactionWhereInput = { userId };

    if (filter?.startDate && filter?.endDate) {
      const gte = new Date(filter.startDate);
      gte.setHours(0, 0, 0, 0);

      const lte = new Date(filter.endDate);
      lte.setHours(23, 59, 59, 999);

      whereClause.transactedAt = { gte, lte };
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
    dto: UpdateTransactionDto,
  ): Promise<ApiResponse<TransactionResponseDto>> {
    const tx = await this.prisma.transaction.findFirst({
      where: { id, userId },
    });
    if (!tx) throw new NotFoundException('Transaction not found');

    const updateData: Prisma.TransactionUpdateInput = {
      amount: dto.amount,
      transactionType: dto.transactionType,
      merchant: dto.merchant,
      note: dto.note,
      transactedAt: dto.transactedAt,
    };

    if (dto.categoryId !== undefined) {
      updateData.category = dto.categoryId
        ? { connect: { id: dto.categoryId } }
        : { disconnect: true };
    }

    const updatedTransaction = await this.prisma.transaction.update({
      where: { id },
      data: updateData,
      include: { category: true },
    });

    return {
      success: true,
      data: this.mapToResponseDto(updatedTransaction),
    };
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
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

    const transactions = await this.prisma.transaction.findMany({
      where: {
        userId,
        transactedAt: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
    });

    return transactions.reduce(
      (acc: { income: number; expense: number }, curr) => {
        const amount = Number(curr.amount);
        if (
          (curr.transactionType as TransactionType) === TransactionType.INCOME
        )
          acc.income += amount;
        else acc.expense += amount;
        return acc;
      },
      { income: 0, expense: 0 },
    );
  }

  private calculateTrend(current: number, previous: number) {
    if (previous === 0 && current === 0) {
      return { value: 0, isPositive: true, noData: true };
    }
    if (previous === 0) {
      return { value: 100, isPositive: current > 0, noData: false };
    }
    const diff = current - previous;
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

    const prevMonthDate = new Date(year, month - 2, 1);
    const prevSummary = await this.calculatePeriodSummary(
      userId,
      prevMonthDate.getMonth() + 1,
      prevMonthDate.getFullYear(),
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
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

    const transactions = await this.prisma.transaction.findMany({
      where: {
        userId,
        transactionType: TransactionType.EXPENSE,
        transactedAt: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
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

  private mapToResponseDto(
    transaction: Prisma.TransactionGetPayload<{ include: { category: true } }>,
  ): TransactionResponseDto {
    return {
      id: transaction.id,
      userId: transaction.userId,
      categoryId: transaction.categoryId,
      amount: Number(transaction.amount),
      transactionType: transaction.transactionType as TransactionType,
      merchant: transaction.merchant,
      bankSource: transaction.bankSource,
      note: transaction.note,
      source: transaction.source as TransactionSource,
      parseStatus: transaction.parseStatus as ParseStatus,
      transactedAt: transaction.transactedAt,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
      category: transaction.category
        ? {
            id: transaction.category.id,
            name: transaction.category.name,
            icon: transaction.category.icon,
            color: transaction.category.color,
          }
        : undefined,
    };
  }
}
