import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { gmail_v1, google } from 'googleapis';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import {
  TransactionSource,
  ParseStatus,
  TransactionType,
} from '../../common/constants/transaction.constant';
import { GmailParserService } from './gmail-parser.service';

@Injectable()
export class GmailService {
  private readonly logger = new Logger(GmailService.name);
  private readonly processingMessages = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly parserService: GmailParserService,
  ) {}

  private getOAuth2Client(
    userId: string,
    tokens?: { accessTokenEncrypted: string; refreshTokenEncrypted: string },
  ) {
    const oAuth2Client = new google.auth.OAuth2(
      this.configService.get<string>('GOOGLE_CLIENT_ID'),
      this.configService.get<string>('GOOGLE_CLIENT_SECRET'),
      this.configService.get<string>('GOOGLE_CALLBACK_URL'),
    );

    if (tokens) {
      const decrypt = (encryptedText: string) => {
        if (!encryptedText) return '';
        const [ivHex, authTagHex, encHex] = encryptedText.split(':');
        if (!ivHex || !authTagHex || !encHex) return '';
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const aesKey = crypto
          .createHash('sha256')
          .update(this.configService.get<string>('JWT_SECRET') || 'secret')
          .digest();

        const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv);
        decipher.setAuthTag(authTag);
        let dec = decipher.update(encHex, 'hex', 'utf8');
        dec += decipher.final('utf8');
        return dec;
      };

      oAuth2Client.setCredentials({
        access_token: decrypt(tokens.accessTokenEncrypted),
        refresh_token: tokens.refreshTokenEncrypted
          ? decrypt(tokens.refreshTokenEncrypted)
          : undefined,
      });
    }

    return oAuth2Client;
  }

  async startWatch(userId: string) {
    const tokenRecord = await this.prisma.gmailToken.findUnique({
      where: { userId },
    });
    if (!tokenRecord) {
      return { success: false, message: 'Google account not connected' };
    }

    const auth = this.getOAuth2Client(userId, tokenRecord);
    const gmail = google.gmail({ version: 'v1', auth });

    try {
      const res = await gmail.users.watch({
        userId: 'me',
        requestBody: {
          topicName:
            this.configService.get<string>('PUBSUB_TOPIC_NAME') ||
            'projects/your-project/topics/gmail-notifications',
          labelIds: ['INBOX'],
        },
      });

      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 7); // Watch expires in 7 days

      await this.prisma.gmailToken.update({
        where: { userId },
        data: {
          historyId: res.data.historyId ? res.data.historyId.toString() : null,
          gmailWatchExpiry: expiryDate,
        },
      });

      return { success: true, data: res.data };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to start watch: ${message}`);

      const err = error as Record<string, unknown>;
      const status = typeof err?.status === 'number' ? err.status : err?.code;

      if (status === 403) {
        return {
          success: false,
          message:
            'Permission insufficient. Please re-connect your Google account.',
        };
      }
      throw error;
    }
  }

  async stopWatch(userId: string) {
    const tokenRecord = await this.prisma.gmailToken.findUnique({
      where: { userId },
    });
    if (!tokenRecord) return { success: true };

    const auth = this.getOAuth2Client(userId, tokenRecord);
    const gmail = google.gmail({ version: 'v1', auth });

    try {
      await gmail.users.stop({ userId: 'me' });
      await this.prisma.gmailToken.update({
        where: { userId },
        data: {
          gmailWatchExpiry: null,
          historyId: null,
        },
      });
    } catch {
      // ignore
    }

    return { success: true };
  }

  async deleteToken(userId: string) {
    await this.prisma.gmailToken.deleteMany({
      where: { userId },
    });
    return { success: true };
  }

  async getStatus(userId: string) {
    const token = await this.prisma.gmailToken.findUnique({
      where: { userId },
    });
    if (!token) return { success: true, connected: false };

    return {
      success: true,
      connected: true,
      watchValid: token.gmailWatchExpiry
        ? token.gmailWatchExpiry > new Date()
        : false,
      lastSyncedAt: token.lastSyncedAt,
    };
  }

  async syncNow(userId: string) {
    const token = await this.prisma.gmailToken.findUnique({
      where: { userId },
    });
    if (!token || !token.historyId) {
      return {
        success: false,
        message: 'Gmail not connected or historyId missing',
      };
    }

    // We simulate a webhook-like check from the current historyId
    const auth = this.getOAuth2Client(userId, token);
    const gmail = google.gmail({ version: 'v1', auth });

    try {
      const historyRes = await gmail.users.history.list({
        userId: 'me',
        startHistoryId: token.historyId,
        historyTypes: ['messageAdded'],
      });

      let processedCount = 0;
      if (historyRes.data.history) {
        for (const historyRecord of historyRes.data.history) {
          if (historyRecord.messagesAdded) {
            for (const msgAdded of historyRecord.messagesAdded) {
              if (msgAdded.message?.id) {
                await this.processMessage(gmail, userId, msgAdded.message.id);
                processedCount++;
              }
            }
          }
        }
      }

      await this.prisma.gmailToken.update({
        where: { id: token.id },
        data: {
          lastSyncedAt: new Date(),
          // We don't necessarily update historyId here unless we get a NEW one from the response
          // But usually history.list results include the new historyId in headers or elsewhere?
          // Actually, we can get it from the latest message or the history itself
        },
      });

      return {
        success: true,
        message: `Sync completed. Processed ${processedCount} messages.`,
      };
    } catch (error) {
      this.logger.error('Manual sync failed', error);
      throw error;
    }
  }

  async handleWebhook(body: { message?: { data?: string } }) {
    if (!body.message?.data) {
      return { success: false }; // ignore invalid payload
    }

    let payload: { emailAddress?: string; historyId?: string | number };
    try {
      payload = JSON.parse(
        Buffer.from(body.message.data, 'base64').toString('utf8'),
      );
    } catch (error) {
      this.logger.error('Failed to parse webhook payload', error);
      return { success: false };
    }

    const { emailAddress, historyId } = payload;
    if (!emailAddress) return { success: true };

    const user = await this.prisma.user.findUnique({
      where: { email: emailAddress },
      include: { gmailToken: true },
    });

    if (!user || !user.gmailToken) return { success: true };

    const startHistoryId = user.gmailToken.historyId;
    if (!startHistoryId) return { success: true }; // No previous baseline

    const auth = this.getOAuth2Client(user.id, user.gmailToken);
    const gmail = google.gmail({ version: 'v1', auth });

    try {
      const historyRes = await gmail.users.history.list({
        userId: 'me',
        startHistoryId,
        historyTypes: ['messageAdded'],
      });

      if (historyRes.data.history) {
        for (const historyRecord of historyRes.data.history) {
          if (historyRecord.messagesAdded) {
            for (const msgAdded of historyRecord.messagesAdded) {
              if (msgAdded.message?.id) {
                await this.processMessage(gmail, user.id, msgAdded.message.id);
              }
            }
          }
        }
      }

      await this.prisma.gmailToken.update({
        where: { id: user.gmailToken.id },
        data: {
          historyId: historyId ? String(historyId) : undefined,
          lastSyncedAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error('Failed processing history', error);
    }

    return { success: true };
  }

  private async processMessage(
    gmail: gmail_v1.Gmail,
    userId: string,
    messageId: string,
  ) {
    // Prevent duplicate processing
    if (this.processingMessages.has(messageId)) {
      return;
    }
    this.processingMessages.add(messageId);

    try {
      const messageRes = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
      });

      const message = messageRes.data;
      const headers = message.payload?.headers || [];
      const fromHeader =
        headers.find((h) => h.name === 'From')?.value || 'Unknown';
      const subjectHeader =
        headers.find((h) => h.name === 'Subject')?.value || 'No Subject';
      const snippet = message.snippet || '';

      if (
        !this.parserService.isPossibleTransaction(
          fromHeader,
          subjectHeader,
          snippet,
        )
      ) {
        return;
      }

      // Deduplication: Check if this message has already been processed in DB
      const existingLog = await this.prisma.emailLog.findUnique({
        where: { gmailMessageId: messageId },
      });

      if (existingLog) {
        return;
      }

      const parsedData = await this.parserService.parseEmail(
        fromHeader,
        subjectHeader,
        snippet,
      );

      // Add a small delay after a successful AI call to respect rate limits
      await new Promise((resolve) => setTimeout(resolve, 2000));

      let categoryId: string | null = null;
      if (parsedData.status === ParseStatus.SUCCESS && parsedData.amount && parsedData.category) {
        const category = await this.prisma.category.findFirst({
          where: {
            userId,
            name: { equals: parsedData.category },
          },
        });

        if (category) {
          categoryId = category.id;
        } else {
          const fallbackName =
            parsedData.type === TransactionType.INCOME
              ? 'Lainnya (Pemasukan)'
              : 'Lainnya (Pengeluaran)';

          const fallbackCategory = await this.prisma.category.findFirst({
            where: {
              userId,
              name: { contains: fallbackName },
            },
          });
          if (fallbackCategory) {
            categoryId = fallbackCategory.id;
          }
        }
      }

      await this.prisma.$transaction(
        async (tx: Prisma.TransactionClient) => {
          let transactionId: string | null = null;
          if (parsedData.status === ParseStatus.SUCCESS && parsedData.amount) {
            const t = await tx.transaction.create({
              data: {
                userId,
                categoryId,
                amount: parsedData.amount,
                transactionType: parsedData.type as string,
                merchant: parsedData.merchant,
                bankSource: parsedData.bankSource,
                source: TransactionSource.AUTO_PARSED,
                parseStatus: ParseStatus.SUCCESS,
                transactedAt: parsedData.date || new Date(),
              },
            });
            transactionId = t.id;
          }

          const failureReason = parsedData.reason
            ? parsedData.reason.substring(0, 450)
            : null;

          await tx.emailLog.create({
            data: {
              userId,
              transactionId,
              gmailMessageId: messageId,
              senderEmail: fromHeader,
              subject: subjectHeader,
              parseStatus: parsedData.status,
              failureReason,
              receivedAt: new Date(
                parseInt(message.internalDate || Date.now().toString()),
              ),
              processedAt: new Date(),
            },
          });
        },
        { maxWait: 10000, timeout: 20000 },
      );
    } catch (error: unknown) {
      const isPrismaUniqueError =
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'P2002';

      if (isPrismaUniqueError) {
        // Skip
      } else {
        this.logger.error(`Failed to process message ${messageId}`, error);
      }
    } finally {
      this.processingMessages.delete(messageId);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async renewWatches() {
    // Find watches expiring in the next 2 days
    const twoDaysFromNow = new Date();
    twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);

    const expiringTokens = await this.prisma.gmailToken.findMany({
      where: {
        gmailWatchExpiry: {
          lte: twoDaysFromNow,
          not: null,
        },
      },
    });

    for (const token of expiringTokens) {
      try {
        await this.startWatch(token.userId);
      } catch (error) {
        this.logger.error(
          `Failed to renew watch for user: ${token.userId}`,
          error,
        );
      }
    }
  }
}
