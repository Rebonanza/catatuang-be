import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import {
  TransactionType,
  BankSource,
  ParseStatus,
} from '../../../common/constants/transaction.constant';
import { ParsedTransaction } from './base.parser';

interface GeminiParsedResponse {
  amount: number;
  type: string;
  merchant: string;
  bankSource: string | null;
  category: string;
  date: string;
  status: string;
  reason?: string;
}

export class AiParser {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: 'gemini-2.5-flash-lite',
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });
  }

  async parse(
    from: string,
    subject: string,
    snippet: string,
  ): Promise<ParsedTransaction> {
    const prompt = `
      You are an expert financial transaction parser for bank and fintech notifications (BCA, BRI, Mandiri, GoPay, OVO, DANA, and any others).
      Support both Indonesian and English languages.
      Parse the following email sender, subject, and content into a structured JSON format.

      JSON fields:
      - amount: number (numeric, absolute value, no separators)
      - type: "income" | "expense"
      - merchant: string (clean and concise, e.g., "McDonald's", "GoPay Topup", "Transfer to John")
      - bankSource: string (e.g., "BCA", "BRI", "Mandiri", "GoPay", "OVO", "PayPal", etc) or null
      - category: string (choose one that best fits from the list below or suggest one if none fits)
      - date: string (ISO 8601 format including time like YYYY-MM-DDTHH:mm:ssZ, use current year 2026 if not specified. Highly preferred to include the exact transaction time if found in the email)
      - status: "success" | "failed" | "needs_review"

      Recommended Categories:
      - Makan & Minum
      - Transport
      - Belanja
      - Tagihan & Utilitas
      - Kesehatan
      - Hiburan
      - Pendidikan
      - Gaji
      - Transfer Masuk
      - Lainnya (Pengeluaran)
      - Lainnya (Pemasukan)

      Rules:
      1. If it's a "Tarik Tunai" or "Withdrawal", it's an "expense" and merchant is "Cash Withdrawal" and category is "Lainnya (Pengeluaran)".
      2. If it's a transfer from someone else, it's "income" and category is "Transfer Masuk".
      3. If it's a transfer to someone else, it's "expense" and category is "Transport" or "Lainnya (Pengeluaran)".
      4. If it's not a financial transaction or bank notification, return {"status": "failed", "reason": "Not a transaction notification"}.
      5. Standardize merchant names (e.g., "PT. GOJEK INDONESIA" -> "Gojek").
      6. Use the sender address to help identify the bankSource if not clear from content.

      Email Sender: ${from}
      Email Subject: ${subject}
      Email Content: ${snippet}
    `;

    const maxRetries = 3;
    let retryCount = 0;
    let lastError: any;

    while (retryCount <= maxRetries) {
      try {
        console.log(
          `AiParser: Calling Gemini API (Attempt ${retryCount + 1})...`,
        );
        const result = await this.model.generateContent(prompt);
        const response = result.response;
        const text = response.text();
        console.log('Gemini Raw Response:', text);
        const parsed = JSON.parse(text) as GeminiParsedResponse;
        console.log('Gemini Parsed Response:', parsed);

        return {
          status: parsed.status as ParseStatus,
          amount: parsed.amount,
          type: parsed.type as TransactionType,
          merchant: parsed.merchant,
          bankSource: parsed.bankSource as BankSource,
          category: parsed.category,
          date: parsed.date ? new Date(parsed.date) : new Date(),
          reason: parsed.reason,
        };
      } catch (error: unknown) {
        lastError = error;
        const isRateLimit =
          error instanceof Error &&
          (error.message.includes('429') ||
            (error as any).status === 429 ||
            (error as any).response?.status === 429);

        if (isRateLimit && retryCount < maxRetries) {
          const delay = Math.pow(2, retryCount + 1) * 1000;
          console.warn(`Rate limit hit. Retrying in ${delay / 1000}s...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          retryCount++;
          continue;
        }

        break; // Not a rate limit or ran out of retries
      }
    }

    const failureReason =
      lastError instanceof Error
        ? lastError.message
        : 'AI Parsing failed after retries';

    return {
      status: ParseStatus.FAILED,
      reason: failureReason,
    };
  }
}
