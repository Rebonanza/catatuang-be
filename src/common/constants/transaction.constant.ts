export enum TransactionType {
  INCOME = 'income',
  EXPENSE = 'expense',
}

export enum TransactionSource {
  AUTO_PARSED = 'auto_parsed',
  MANUAL = 'manual',
}

export enum ParseStatus {
  SUCCESS = 'success',
  FAILED = 'failed',
  NEEDS_REVIEW = 'needs_review',
  SKIPPED = 'skipped',
}

export enum BankSource {
  BCA = 'BCA',
  BRI = 'BRI',
  MANDIRI = 'Mandiri',
  GOPAY = 'GoPay',
  OVO = 'OVO',
  DANA = 'Dana',
}
