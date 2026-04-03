import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';

export interface GeminiParsedResponse {
  status: string;
  type: string;
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
      model: 'gemini-1.5-flash',
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
      Extract transaction data from this Indonesian bank email notification.
      From: ${from}
      Subject: ${subject}
      Snippet: ${snippet}

      Rules:
      1. CRITICAL: Distinguish between a real TRANSACTION notification and a PROMOTION/ADVERTISEMENT.
      2. A real transaction must have a clear amount that was deducted, added, or paid.
      3. If the email is a promotion, newsletter, offer, or advertisement (e.g., Spotify ads, 'Try Premium' offers, marketing newsletters), set status to 'failed' and reason to 'promotion'.
      4. If it's a real money transfer, payment, or expense, type is 'expense'.
      5. If it's a real received transfer or balance addition, type is 'income'.
      6. If no transaction data found or it is clearly not a financial transaction, set status to 'failed'.
      7. If a valid transaction is found, set status to 'success'.
      8. Amount must be a number or null.
      9. Merchant is the destination of the payment or source of income.
      10. BankSource is the bank/wallet name (e.g., BCA, Mandiri, GoPay, OVO).
      11. Date must be in ISO format or null.
      12. Category must be one of: 'Makan & Minum', 'Transport', 'Belanja', 'Tagihan & Utilitas', 'Kesehatan', 'Hiburan', 'Pendidikan', 'Gaji', 'Transfer Masuk'. Find the most suitable.

      Respond in JSON format:
      {
        "status": "success" | "failed",
        "type": "expense" | "income",
        "amount": number,
        "merchant": string,
        "bankSource": string,
        "date": "ISOString",
        "category": string,
        "reason": string
      }
    `;

    const maxRetries = 3;
    let retryCount = 0;
    let lastError: unknown;

    while (retryCount <= maxRetries) {
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
          retryCount++;
          continue;
        }

        throw error;
      }
    }

    throw lastError;
  }
}
