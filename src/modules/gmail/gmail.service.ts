import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { gmail_v1, google } from 'googleapis';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { EncryptionService } from '../../common/services/encryption.service';
import {
  TransactionSource,
  ParseStatus,
  TransactionType,
} from '../../common/constants/transaction.constant';
import { GmailParserService } from './gmail-parser.service';
import { NotificationService } from '../notifications/notification.service';
import { NotificationType } from '../../common/constants/notification.constant';
import {
  GmailActionResponse,
  GmailStatusResponse,
  GmailSyncResponse,
  GmailWatchResponse,
} from './interfaces/gmail-response.interface';
import {
  NotFoundException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';

@Injectable()
export class GmailService implements OnModuleDestroy {
  private readonly logger = new Logger(GmailService.name);
  private readonly processingMessages = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly parserService: GmailParserService,
    private readonly notificationService: NotificationService,
    private readonly encryptionService: EncryptionService,
  ) {}

  onModuleDestroy() {
    for (const timeout of this.processingMessages.values()) {
      clearTimeout(timeout);
    }
    this.processingMessages.clear();
  }

  private getOAuth2Client(tokens?: {
    accessTokenEncrypted: string;
    refreshTokenEncrypted: string;
  }) {
    const oAuth2Client = new google.auth.OAuth2(
      this.configService.get<string>('GOOGLE_CLIENT_ID'),
      this.configService.get<string>('GOOGLE_CLIENT_SECRET'),
      this.configService.get<string>('GOOGLE_CALLBACK_URL'),
    );

    if (tokens) {
      oAuth2Client.setCredentials({
        access_token: this.encryptionService.decrypt(
          tokens.accessTokenEncrypted,
        ),
        refresh_token: tokens.refreshTokenEncrypted
          ? this.encryptionService.decrypt(tokens.refreshTokenEncrypted)
          : undefined,
      });
    }

    return oAuth2Client;
  }

  async startWatch(userId: string): Promise<GmailWatchResponse> {
    const tokenRecord = await this.prisma.gmailToken.findUnique({
      where: { userId },
    });
    if (!tokenRecord) {
      throw new NotFoundException('Google account not connected');
    }

    const auth = this.getOAuth2Client(tokenRecord);
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

      return {
        success: true,
        data: {
          historyId: res.data.historyId,
          expiration: res.data.expiration,
        },
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to start watch: ${message}`);

      const err = error as Record<string, unknown>;
      const status =
        typeof err?.status === 'number'
          ? err.status
          : (err?.code as number | string | undefined);

      if (status === 403) {
        throw new ForbiddenException(
          'Permission insufficient. Please re-connect your Google account.',
        );
      }
      throw new InternalServerErrorException(
        `Failed to start watch: ${message}`,
      );
    }
  }

  async stopWatch(userId: string): Promise<GmailActionResponse> {
    const tokenRecord = await this.prisma.gmailToken.findUnique({
      where: { userId },
    });
    if (!tokenRecord) return { success: true };

    const auth = this.getOAuth2Client(tokenRecord);
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
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to stop watch: ${message}`);
      return { success: true }; // Still return success as we attempt to clean up
    }
  }

  async deleteToken(userId: string): Promise<GmailActionResponse> {
    try {
      await this.prisma.gmailToken.deleteMany({
        where: { userId },
      });
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to delete token: ${message}`);
      throw new InternalServerErrorException(
        'Failed to delete Google account connection',
      );
    }
  }

  async getStatus(userId: string): Promise<GmailStatusResponse> {
    try {
      const token = await this.prisma.gmailToken.findUnique({
        where: { userId },
      });
      if (!token)
        return {
          success: true,
          data: { connected: false, watchValid: false, lastSyncedAt: null },
        };

      return {
        success: true,
        data: {
          connected: true,
          watchValid: token.gmailWatchExpiry
            ? token.gmailWatchExpiry > new Date()
            : false,
          lastSyncedAt: token.lastSyncedAt,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new InternalServerErrorException(
        `Failed to get status: ${message}`,
      );
    }
  }

  async syncNow(userId: string): Promise<GmailSyncResponse> {
    const token = await this.prisma.gmailToken.findUnique({
      where: { userId },
    });
    if (!token || !token.historyId) {
      throw new NotFoundException(
        'Gmail not connected or history baseline missing',
      );
    }

    // We simulate a webhook-like check from the current historyId
    const auth = this.getOAuth2Client(token);
    const gmail = google.gmail({ version: 'v1', auth });

    try {
      const historyRes = await gmail.users.history.list({
        userId: 'me',
        startHistoryId: token.historyId,
        historyTypes: ['messageAdded'],
      });

      let processedCount = 0;
      // Track the latest historyId seen so we don't re-process on the next sync
      let latestHistoryId: string | null = null;

      if (historyRes.data.history) {
        for (const historyRecord of historyRes.data.history) {
          // historyId on each record is a string number; keep the largest one
          if (historyRecord.id) {
            latestHistoryId = historyRecord.id;
          }
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

      // Also use the top-level historyId from the response if available
      if (historyRes.data.historyId) {
        latestHistoryId = historyRes.data.historyId;
      }

      await this.prisma.gmailToken.update({
        where: { id: token.id },
        data: {
          lastSyncedAt: new Date(),
          // Advance the historyId baseline so the next sync starts from here
          ...(latestHistoryId ? { historyId: latestHistoryId } : {}),
        },
      });

      return {
        success: true,
        data: {
          processedCount,
          message: `Sync completed. Processed ${processedCount} messages.`,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Manual sync failed', message);
      throw new InternalServerErrorException(`Sync failed: ${message}`);
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
      ) as typeof payload;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to parse webhook payload: ${message}`);
      return { success: true }; // Return true to avoid GCP Pub/Sub retry spam
    }

    const { emailAddress, historyId } = payload;
    if (!emailAddress) return { success: true };

    const gmailToken = await this.prisma.gmailToken.findFirst({
      where: { email: emailAddress },
      include: { user: true },
    });

    if (!gmailToken || !gmailToken.user) return { success: true };

    const user = gmailToken.user;
    const startHistoryId = gmailToken.historyId;
    if (!startHistoryId) return { success: true }; // No previous baseline

    const auth = this.getOAuth2Client(gmailToken);
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
        where: { id: gmailToken.id },
        data: {
          historyId: historyId ? String(historyId) : undefined,
          lastSyncedAt: new Date(),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Webhook history processing failed: ${message}`);
      return { success: true }; // Return true to avoid GCP Pub/Sub retry spam
    }

    return { success: true };
  }

  private collectParts(
    part: gmail_v1.Schema$MessagePart,
    result: gmail_v1.Schema$MessagePart[] = [],
  ): gmail_v1.Schema$MessagePart[] {
    result.push(part);
    if (part.parts) {
      for (const child of part.parts) {
        this.collectParts(child, result);
      }
    }
    return result;
  }

  /**
   * Extracts plain-text body from a Gmail message payload.
   * Tries text/plain first, falls back to text/html stripped of tags.
   * Returns at most maxChars characters to keep the AI prompt concise.
   */
  private extractEmailBody(
    payload: gmail_v1.Schema$MessagePart | undefined,
    maxChars = 3000,
  ): string {
    if (!payload) return '';

    const allParts = this.collectParts(payload);

    // Prefer text/plain
    const plainPart = allParts.find((p) => p.mimeType === 'text/plain');
    if (plainPart?.body?.data) {
      const buffer = Buffer.from(plainPart.body.data, 'base64');
      const maxBytes = maxChars * 3; // estimasi UTF-8 worst case
      return buffer.slice(0, maxBytes).toString('utf8').substring(0, maxChars);
    }

    // Fallback: text/html stripped of tags
    const htmlPart = allParts.find((p) => p.mimeType === 'text/html');
    if (htmlPart?.body?.data) {
      const buffer = Buffer.from(htmlPart.body.data, 'base64');
      const maxBytes = maxChars * 3;
      const decoded = buffer
        .slice(0, maxBytes)
        .toString('utf8')
        .substring(0, maxChars);

      const stripped = decoded
        .replace(/<style[^>]*>.*?<\/style>/gis, '')
        .replace(/<script[^>]*>.*?<\/script>/gis, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return stripped;
    }

    return '';
  }

  private async processMessage(
    gmail: gmail_v1.Gmail,
    userId: string,
    messageId: string,
  ) {
    // Prevent duplicate processing with 5-minute TTL
    if (this.processingMessages.has(messageId)) {
      return;
    }

    // Set a timeout to clear the message from the map after 5 minutes
    const timeout = setTimeout(
      () => {
        this.processingMessages.delete(messageId);
      },
      5 * 60 * 1000,
    );

    this.processingMessages.set(messageId, timeout);

    try {
      // 1. Get metadata first for lightweight pre-check
      const metaRes = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject'],
      });

      const messageData = metaRes.data;
      const headers = messageData.payload?.headers || [];
      const fromHeader =
        headers.find((h) => h.name === 'From')?.value || 'Unknown';
      const subjectHeader =
        headers.find((h) => h.name === 'Subject')?.value || 'No Subject';
      const snippet = messageData.snippet || '';

      if (
        !this.parserService.isPossibleTransaction(
          fromHeader,
          subjectHeader,
          snippet,
        )
      ) {
        return;
      }

      // 2. Only if possible transaction, get full content
      const fullRes = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full', // ensure payload parts are returned
      });

      const message = fullRes.data;
      // Use full body for accurate AI parsing; fall back to snippet if empty
      const emailBody = this.extractEmailBody(message.payload) || snippet;

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
        emailBody,
      );

      const delay =
        this.configService.get<number>('GMAIL_AI_PROCESS_DELAY_MS') || 2000;
      await new Promise((resolve) => setTimeout(resolve, delay));

      let categoryId: string | null = null;
      if (
        parsedData.status === ParseStatus.SUCCESS &&
        parsedData.amount &&
        parsedData.category
      ) {
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
          // Trigger notification
          this.notificationService.notifyUser({
            userId,
            type: NotificationType.TRANSACTION_PROCESSED,
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
        this.logger.error(
          `Failed to process message ${messageId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
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
