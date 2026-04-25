import {
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TransactionType } from '../../../common/constants/transaction.constant';

export class UpdateTransactionDto {
  @IsString()
  @IsOptional()
  categoryId?: string;

  @IsNumber()
  @IsOptional()
  amount?: number;

  @IsEnum(TransactionType)
  @IsOptional()
  transactionType?: TransactionType;

  @IsString()
  @IsOptional()
  merchant?: string;

  @IsString()
  @IsOptional()
  note?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  transactedAt?: Date;
}
