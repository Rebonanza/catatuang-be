import { TransactionType } from './transaction.constant';

interface DefaultCategory {
  name: string;
  type: TransactionType;
  icon: string;
}

export const DEFAULT_CATEGORIES: readonly DefaultCategory[] = [
  { name: 'Makan & Minum', type: TransactionType.EXPENSE, icon: 'utensils' },
  { name: 'Transport', type: TransactionType.EXPENSE, icon: 'car' },
  { name: 'Belanja', type: TransactionType.EXPENSE, icon: 'shopping-bag' },
  { name: 'Tagihan & Utilitas', type: TransactionType.EXPENSE, icon: 'zap' },
  { name: 'Kesehatan', type: TransactionType.EXPENSE, icon: 'heart-pulse' },
  { name: 'Hiburan', type: TransactionType.EXPENSE, icon: 'tv' },
  { name: 'Pendidikan', type: TransactionType.EXPENSE, icon: 'book-open' },
  {
    name: 'Lainnya (Pengeluaran)',
    type: TransactionType.EXPENSE,
    icon: 'circle-ellipsis',
  },
  { name: 'Gaji', type: TransactionType.INCOME, icon: 'briefcase' },
  {
    name: 'Transfer Masuk',
    type: TransactionType.INCOME,
    icon: 'arrow-down-circle',
  },
  {
    name: 'Lainnya (Pemasukan)',
    type: TransactionType.INCOME,
    icon: 'circle-ellipsis',
  },
] as const;

// Helper: ubah jadi format yang siap di-insert Prisma
export function buildCategoriesData(userId: string) {
  return DEFAULT_CATEGORIES.map((cat) => ({
    userId,
    name: cat.name,
    icon: cat.icon,
    transactionType: cat.type,
    isDefault: true,
  }));
}
