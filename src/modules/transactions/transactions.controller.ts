import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { GetTransactionsFilterDto } from './dto/get-transactions-filter.dto';
import { TransactionResponseDto } from './dto/transaction-response.dto';
import { ApiResponse } from '../../common/interfaces/api-response.interface';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { type AuthenticatedRequest } from '../../common/interfaces/request.interface';

@UseGuards(JwtAuthGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post()
  create(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreateTransactionDto,
  ): Promise<ApiResponse<TransactionResponseDto>> {
    return this.transactionsService.create(req.user.id, dto);
  }

  @Get()
  findAll(
    @Request() req: AuthenticatedRequest,
    @Query() query: GetTransactionsFilterDto,
  ): Promise<ApiResponse<TransactionResponseDto[]>> {
    return this.transactionsService.findAll(req.user.id, query);
  }

  @Get('summary')
  getSummary(
    @Request() req: AuthenticatedRequest,
    @Query('month') month: string,
    @Query('year') year: string,
  ) {
    const d = new Date();
    return this.transactionsService.getSummary(
      req.user.id,
      month ? parseInt(month) : d.getMonth() + 1,
      year ? parseInt(year) : d.getFullYear(),
    );
  }

  @Get('categories-summary')
  getCategorySummary(
    @Request() req: AuthenticatedRequest,
    @Query('month') month: string,
    @Query('year') year: string,
  ) {
    const d = new Date();
    return this.transactionsService.getCategorySummary(
      req.user.id,
      month ? parseInt(month) : d.getMonth() + 1,
      year ? parseInt(year) : d.getFullYear(),
    );
  }

  @Patch(':id')
  update(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateTransactionDto,
  ): Promise<ApiResponse<TransactionResponseDto>> {
    return this.transactionsService.update(req.user.id, id, dto);
  }

  @Delete('bulk')
  async removeMany(
    @Body('ids') ids: string[],
    @Request() req: AuthenticatedRequest,
  ): Promise<ApiResponse> {
    await this.transactionsService.removeMany(ids, req.user.id);
    return { success: true };
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<ApiResponse> {
    await this.transactionsService.remove(id, req.user.id);
    return { success: true };
  }
}
