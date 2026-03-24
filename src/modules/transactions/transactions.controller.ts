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
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post()
  create(@Request() req: any, @Body() dto: CreateTransactionDto) {
    return this.transactionsService.create(req.user.sub, dto);
  }

  @Get()
  findAll(@Request() req: any, @Query() query: any) {
    return this.transactionsService.findAll(req.user.sub, query);
  }

  @Get('summary')
  getSummary(
    @Request() req: any,
    @Query('month') month: string,
    @Query('year') year: string,
  ) {
    const d = new Date();
    return this.transactionsService.getSummary(
      req.user.sub,
      month ? parseInt(month) : d.getMonth() + 1,
      year ? parseInt(year) : d.getFullYear(),
    );
  }

  @Get('categories-summary')
  getCategorySummary(
    @Request() req: any,
    @Query('month') month: string,
    @Query('year') year: string,
  ) {
    const d = new Date();
    return this.transactionsService.getCategorySummary(
      req.user.sub,
      month ? parseInt(month) : d.getMonth() + 1,
      year ? parseInt(year) : d.getFullYear(),
    );
  }

  @Patch(':id')
  update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateTransactionDto,
  ) {
    return this.transactionsService.update(req.user.sub, id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Request() req: any) {
    await this.transactionsService.remove(id, req.user.sub);
    return { success: true };
  }

  @Delete('bulk')
  async removeMany(@Body('ids') ids: string[], @Request() req: any) {
    await this.transactionsService.removeMany(ids, req.user.sub);
    return { success: true };
  }
}
