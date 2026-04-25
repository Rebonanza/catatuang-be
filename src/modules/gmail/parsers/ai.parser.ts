import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import {
  ParseStatus,
  TransactionType,
} from '../../../common/constants/transaction.constant';

export interface GeminiParsedResponse {
  status: ParseStatus.SUCCESS | ParseStatus.FAILED;
  type: TransactionType.EXPENSE | TransactionType.INCOME | null;
  amount: number | null;
  merchant: string | null;
  bankSource: string | null;
  date: string | null;
  category: string | null;
  reason: string | null;
}

interface GeminiError {
  status?: number;
  response?: {
    status?: number;
  };
}

@Injectable()
export class AiParser {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not defined');
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-lite',
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });
  }

  async parse(
    from: string,
    subject: string,
    snippet: string,
  ): Promise<GeminiParsedResponse> {
    const prompt = `
      You are a financial data extractor specialized in Indonesian bank and e-wallet email notifications.
      Analyze the following email and extract transaction data.

      From: ${from}
      Subject: ${subject}
      Email Body:
      ---
      ${snippet}
      ---

      CLASSIFICATION RULES (apply in order):

      1. REAL TRANSACTION indicators (set status = 'success'):
         - Contains a clear Rupiah amount (e.g., "Rp 150.000", "IDR 50.000", "sebesar Rp", "senilai Rp")
         - Keywords: "transaksi", "pembayaran", "transfer", "debit", "kredit", "tagihan", "berhasil",
           "notifikasi", "mutasi", "penarikan", "top up", "pembelian", "cicilan"
         - Sent from official bank/wallet domains: bca.co.id, bankmandiri.co.id, bni.co.id, bri.co.id,
           gopay.co.id, tokopedia.com, dana.id, ovo.id, shopee.co.id, jenius.com, livin.id, jago.com

      2. PROMOTION/ADVERTISEMENT indicators (set status = 'failed', reason = 'promotion'):
         - No specific Rupiah amount tied to an actual completed transaction
         - Keywords like: "promo", "diskon", "cashback penawaran", "gratis", "hadiah", "daftar sekarang",
           "coba gratis", "upgrade", "newsletter", "penawaran spesial"
         - Email is clearly an offer, advertisement, or marketing campaign

      3. If a real transaction is found:
         - type = 'expense' for payments, purchases, transfers out, debit
         - type = 'income' for received transfers, top-up received, salary credit

      4. amount: extract only the numeric value (e.g., "Rp 150.000" → 150000). Must be a number or null.
      5. merchant: destination of payment or source of income (e.g., "Tokopedia", "PLN", "Pak Budi")
      6. bankSource: the bank or e-wallet name (e.g., "BCA", "GoPay", "OVO", "Mandiri")
      7. date: transaction date in ISO 8601 format, or null if not found
      8. category: choose the BEST match from this list only:
         'Makan & Minum', 'Transport', 'Belanja', 'Tagihan & Utilitas', 'Kesehatan',
         'Hiburan', 'Pendidikan', 'Gaji', 'Transfer Masuk'
      9. reason: only set when status = 'failed' (e.g., 'promotion', 'no_amount', 'not_transaction')

      Respond ONLY with valid JSON in this exact format:
      {
        "status": "success" | "failed",
        "type": "expense" | "income" | null,
        "amount": number | null,
        "merchant": string | null,
        "bankSource": string | null,
        "date": "ISOString" | null,
        "category": string | null,
        "reason": string | null
      }
    `;

    const maxRetries = 3;
    let lastError: unknown;

    for (let retryCount = 0; retryCount < maxRetries; retryCount++) {
      try {
        const result = await this.model.generateContent(prompt);
        const response = result.response;
        const text = response.text();
        const parsed = JSON.parse(text) as GeminiParsedResponse;

        return {
          status: parsed.status,
          type: parsed.type,
          amount: parsed.amount,
          merchant: parsed.merchant,
          bankSource: parsed.bankSource,
          date: parsed.date,
          category: parsed.category,
          reason: parsed.reason,
        };
      } catch (error: unknown) {
        lastError = error;

        const geminiError = error as GeminiError;
        const isRateLimit =
          error instanceof Error &&
          (error.message.includes('429') ||
            geminiError.status === 429 ||
            geminiError.response?.status === 429);

        if (isRateLimit && retryCount < maxRetries) {
          const delay = Math.pow(2, retryCount + 1) * 1000;
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        throw error;
      }
    }

    throw lastError;
  }
}
