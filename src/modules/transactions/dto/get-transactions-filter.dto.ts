import { IsOptional, IsString, IsEnum, IsDate } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TransactionType } from '../../../common/constants/transaction.constant';

const toUndefinedIfEmpty = ({ value }: { value: unknown }) =>
  value === '' || value === null ? undefined : value;

export class GetTransactionsFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  page?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  limit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;

  @ApiPropertyOptional({ enum: TransactionType })
  @IsOptional()
  @IsEnum(TransactionType)
  @Transform(toUndefinedIfEmpty)
  transactionType?: TransactionType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(toUndefinedIfEmpty)
  categoryId?: string;
}
