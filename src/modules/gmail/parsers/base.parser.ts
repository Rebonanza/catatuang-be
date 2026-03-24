import {
  TransactionType,
  BankSource,
  ParseStatus,
} from '../../../common/constants/transaction.constant';

export interface ParsedTransaction {
  status: ParseStatus;
  amount?: number;
  type?: TransactionType;
  merchant?: string;
  bankSource?: BankSource;
  category?: string;
  date?: Date;
  reason?: string;
}
