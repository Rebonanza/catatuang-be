import { Injectable } from '@nestjs/common';
import {
  ParseStatus,
  BankSource,
} from '../../common/constants/transaction.constant';
import { ParsedTransaction } from './parsers/base.parser';
import { AiParser } from './parsers/ai.parser';

@Injectable()
export class GmailParserService {
  private readonly financialKeywords = [
    'rp',
    'idr',
    'bayar',
    'pembayaran',
    'transaksi',
    'transfer',
    'dana',
    'gopay',
    'ovo',
    'shopeepay',
    'm-banking',
    'tagihan',
    'struk',
    'receipt',
    'invoice',
    'spent',
    'received',
    'expense',
    'income',
  ];

  private readonly financialSenders = [
    'bca.co.id',
    'mandiri',
    'bri.co.id',
    'gojek.com',
    'ovo.id',
    'dana.id',
    'shopee.co.id',
    'tokopedia.com',
    'grab.com',
  ];

  constructor(private readonly aiParser: AiParser) {}

  isPossibleTransaction(
    from: string,
    subject: string,
    snippet: string,
  ): boolean {
    const lowerSubject = subject.toLowerCase();
    const lowerSnippet = snippet.toLowerCase();
    const lowerFrom = from.toLowerCase();

    // Check if any keyword matches subject or snippet
    const hasKeyword = this.financialKeywords.some(
      (kw) => lowerSubject.includes(kw) || lowerSnippet.includes(kw),
    );

    // List of known transaction senders (can be expanded)
    const isFinancialSender = this.financialSenders.some((sender) =>
      lowerFrom.includes(sender),
    );

    return hasKeyword || isFinancialSender;
  }

  private parseBankSource(source: string | null): BankSource | undefined {
    if (!source) return undefined;

    const normalized = source.toLowerCase().replace(/[^a-z]/g, '');

    if (normalized.includes('bca')) return BankSource.BCA;
    if (normalized.includes('bri')) return BankSource.BRI;
    if (normalized.includes('mandiri')) return BankSource.MANDIRI;
    if (normalized.includes('gopay')) return BankSource.GOPAY;
    if (normalized.includes('ovo')) return BankSource.OVO;
    if (normalized.includes('dana')) return BankSource.DANA;

    return undefined;
  }

  async parseEmail(
    from: string,
    subject: string,
    snippet: string,
  ): Promise<ParsedTransaction> {
    try {
      const result = await this.aiParser.parse(from, subject, snippet);

      return {
        status: result.status,
        type: result.type ?? undefined,
        date: result.date ? new Date(result.date) : undefined,
        amount: result.amount ?? undefined,
        merchant: result.merchant ?? undefined,
        bankSource: this.parseBankSource(result.bankSource),
        category: result.category ?? undefined,
        reason: result.reason ?? undefined,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { status: ParseStatus.FAILED, reason: message };
    }
  }
}
