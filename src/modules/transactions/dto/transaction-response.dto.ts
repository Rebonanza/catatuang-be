import {
  TransactionType,
  TransactionSource,
  ParseStatus,
} from '../../../common/constants/transaction.constant';

export class TransactionResponseDto {
  id: string;
  userId: string;
  categoryId: string | null;
  amount: number;
  transactionType: TransactionType;
  merchant: string | null;
  bankSource: string | null;
  note: string | null;
  source: TransactionSource;
  parseStatus: ParseStatus | null;
  transactedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  category?: {
    id: string;
    name: string;
    icon: string | null;
    color: string | null;
  };
}
