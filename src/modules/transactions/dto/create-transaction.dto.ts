import {
  IsDate,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TransactionType } from '../../../common/constants/transaction.constant';

export class CreateTransactionDto {
  @IsString()
  @IsOptional()
  categoryId?: string;

  @IsNumber()
  @IsNotEmpty()
  amount!: number;

  @IsEnum(TransactionType)
  @IsNotEmpty()
  transactionType!: TransactionType;

  @IsString()
  @IsOptional()
  merchant?: string;

  @IsString()
  @IsOptional()
  note?: string;

  @IsNotEmpty()
  @Type(() => Date)
  @IsDate()
  transactedAt!: Date;
}
