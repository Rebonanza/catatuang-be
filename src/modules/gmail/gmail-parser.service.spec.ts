import {
  BankSource,
  ParseStatus,
  TransactionType,
} from '../../common/constants/transaction.constant';

import { GmailParserService } from './gmail-parser.service';
import { AiParser, GeminiParsedResponse } from './parsers/ai.parser';

jest.mock('./parsers/ai.parser');

describe('GmailParserService', () => {
  let service: GmailParserService;
  let mockAiParser: jest.Mocked<AiParser>;

  beforeEach(() => {
    const mockConfigService = {
      get: jest.fn().mockReturnValue('mock-api-key'),
    };
    service = new GmailParserService(mockConfigService as any);
    service.onModuleInit();
    mockAiParser = (service as any).aiParser;
  });

  describe('isPossibleTransaction', () => {
    it('should return true for emails with financial keywords', () => {
      expect(
        service.isPossibleTransaction(
          'promo@shopee.co.id',
          'Konfirmasi Pembayaran',
          'Rp 50.000 berhasil',
        ),
      ).toBe(true);
      expect(
        service.isPossibleTransaction(
          'noreply@bca.co.id',
          'M-BCA: Notifikasi',
          'Transfer dana',
        ),
      ).toBe(true);
    });

    it('should return false for non-financial emails', () => {
      expect(
        service.isPossibleTransaction(
          'friend@gmail.com',
          'What are you doing?',
          'Just checking in on you.',
        ),
      ).toBe(false);
      expect(
        service.isPossibleTransaction(
          'newsletter@tech.com',
          'Weekly Update',
          'Here is your weekly tech news.',
        ),
      ).toBe(false);
    });
  });

  describe('parseEmail', () => {
    it('should parse BCA expense', async () => {
      const resultData: GeminiParsedResponse = {
        status: 'success',
        amount: 50000,
        type: 'expense',
        merchant: 'ANDRE',
        bankSource: 'BCA',
        category: 'Lainnya (Pengeluaran)',
        date: '2026-03-22T17:47:00.000Z',
        reason: null,
      };
      mockAiParser.parse.mockResolvedValue(resultData);

      const subject = 'M-BCA: Pengeluaran';
      const snippet =
        'M-BCA: Pengeluaran: Rp. 50.000,00 ke Rek: 1234567890 (ANDRE) tgl 22/03/26 17:47';
      const result = await service.parseEmail(
        'noreply@bca.co.id',
        subject,
        snippet,
      );

      expect(result.status).toBe(ParseStatus.SUCCESS);
      expect(result.amount).toBe(50000);
      expect(result.type).toBe(TransactionType.EXPENSE);
      expect(result.merchant).toBe('ANDRE');
      expect(result.bankSource).toBe(BankSource.BCA);
      expect(result.category).toBe('Lainnya (Pengeluaran)');
    });

    it('should parse GoPay payment', async () => {
      const resultData: GeminiParsedResponse = {
        status: 'success',
        amount: 25000,
        type: 'expense',
        merchant: 'Kopi Kenangan',
        bankSource: 'GoPay',
        category: 'Makan & Minum',
        date: '2026-03-22T00:00:00.000Z',
        reason: null,
      };
      mockAiParser.parse.mockResolvedValue(resultData);

      const subject = 'Pembayaran Berhasil';
      const snippet =
        'Gopay: Pembayaran ke Kopi Kenangan senilai Rp25.000 berhasil pada 22/03/26';
      const result = await service.parseEmail(
        'noreply@gojek.com',
        subject,
        snippet,
      );

      expect(result.status).toBe(ParseStatus.SUCCESS);
      expect(result.amount).toBe(25000);
      expect(result.type).toBe(TransactionType.EXPENSE);
      expect(result.merchant).toBe('Kopi Kenangan');
      expect(result.bankSource).toBe(BankSource.GOPAY);
      expect(result.category).toBe('Makan & Minum');
    });

    it('should fail for promotional emails', async () => {
      const resultData: GeminiParsedResponse = {
        status: 'failed',
        amount: null,
        type: 'expense',
        merchant: null,
        bankSource: null,
        category: null,
        date: null,
        reason: 'promotion',
      };
      mockAiParser.parse.mockResolvedValue(resultData);

      const subject = 'Spotify Premium: Coba 3 Bulan Gratis';
      const snippet =
        'Nikmati musik tanpa iklan dengan Spotify Premium. Coba sekarang!';
      const result = await service.parseEmail(
        'no-reply@spotify.com',
        subject,
        snippet,
      );

      expect(result.status).toBe(ParseStatus.FAILED);
      expect(result.reason).toBe('promotion');
    });
  });
});
