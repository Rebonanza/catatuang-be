import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ParseStatus } from '../../common/constants/transaction.constant';
import { ParsedTransaction } from './parsers/base.parser';
import { AiParser } from './parsers/ai.parser';

@Injectable()
export class GmailParserService implements OnModuleInit {
  private aiParser: AiParser | null = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (apiKey) {
      this.aiParser = new AiParser(apiKey);
    }
  }

  isPossibleTransaction(
    from: string,
    subject: string,
    snippet: string,
  ): boolean {
    const financialKeywords = [
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

    const lowerSubject = subject.toLowerCase();
    const lowerSnippet = snippet.toLowerCase();
    const lowerFrom = from.toLowerCase();

    // Check if any keyword matches subject or snippet
    const hasKeyword = financialKeywords.some(
      (kw) => lowerSubject.includes(kw) || lowerSnippet.includes(kw),
    );

    // List of known transaction senders (can be expanded)
    const financialSenders = [
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

    const isFinancialSender = financialSenders.some((sender) =>
      lowerFrom.includes(sender),
    );

    return hasKeyword || isFinancialSender;
  }

  async parseEmail(
    from: string,
    subject: string,
    snippet: string,
  ): Promise<ParsedTransaction> {
    console.log(`ParserService: Parsing email from ${from}`);
    try {
      if (!this.aiParser) {
        return {
          status: ParseStatus.FAILED,
          reason: 'AI Parser not initialized (GEMINI_API_KEY missing)',
        };
      }

      const result = await this.aiParser.parse(from, subject, snippet);
      return result;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { status: ParseStatus.FAILED, reason: message };
    }
  }
}
