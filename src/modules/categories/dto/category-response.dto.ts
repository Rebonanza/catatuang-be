import { TransactionType } from '../../../common/constants/transaction.constant';

export class CategoryResponseDto {
  id: string;
  userId: string;
  name: string;
  icon: string | null;
  color: string | null;
  transactionType: TransactionType;
  isDefault: boolean;
  createdAt: Date;
}
