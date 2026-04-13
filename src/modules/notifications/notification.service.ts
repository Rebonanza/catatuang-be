import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { PrismaService } from '../../prisma/prisma.service';
import { Subject } from 'rxjs';
import { bufferTime, filter, groupBy, mergeMap } from 'rxjs/operators';

@Injectable()
export class NotificationService implements OnModuleInit {
  private readonly logger = new Logger(NotificationService.name);
  private firebaseApp: admin.app.App | null = null;
  private readonly notificationSubject = new Subject<{ userId: string }>();

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.setupNotificationBundling();
  }

  onModuleInit() {
    this.initializeFirebase();
  }

  private initializeFirebase() {
    try {
      const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
      const clientEmail = this.configService.get<string>(
        'FIREBASE_CLIENT_EMAIL',
      );
      const privateKey = this.configService
        .get<string>('FIREBASE_PRIVATE_KEY')
        ?.replace(/\\n/g, '\n');

      if (!projectId || !clientEmail || !privateKey) {
        this.logger.warn(
          'Firebase credentials not fully configured. Push notifications will be disabled.',
        );
        return;
      }

      this.firebaseApp = admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
      this.logger.log('Firebase Admin initialized successfully.');
    } catch (error) {
      this.logger.error('Failed to initialize Firebase Admin', error);
    }
  }

  private setupNotificationBundling() {
    this.notificationSubject
      .asObservable()
      .pipe(
        // Group notifications by userId
        groupBy((payload) => payload.userId),
        // For each group, buffer for 10 seconds
        mergeMap((group$) =>
          group$.pipe(
            bufferTime(10000),
            filter((notifications) => notifications.length > 0),
          ),
        ),
      )
      .subscribe(async (notifications) => {
        const userId = notifications[0].userId;
        const count = notifications.length;
        await this.sendPushNotification(userId, count);
      });
  }

  async saveToken(userId: string, token: string) {
    try {
      await this.prisma.fcmToken.upsert({
        where: { token },
        update: { userId, updatedAt: new Date() },
        create: { userId, token },
      });
      this.logger.log(`FCM Token registered for user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to save FCM token for user ${userId}`, error);
    }
  }

  notifyTransactionProcessed(userId: string) {
    this.notificationSubject.next({ userId });
  }

  private async sendPushNotification(userId: string, count: number) {
    if (!this.firebaseApp) return;

    try {
      const tokens = await this.prisma.fcmToken.findMany({
        where: { userId },
        select: { token: true },
      });

      if (tokens.length === 0) return;

      const registrationTokens = tokens.map((t) => t.token);

      const title = 'Transaksi Terproses';
      const body =
        count > 1
          ? `${count} transaksi baru telah berhasil diproses.`
          : 'Satu transaksi baru telah berhasil diproses.';

      const message: admin.messaging.MulticastMessage = {
        tokens: registrationTokens,
        notification: {
          title,
          body,
        },
        data: {
          type: 'TRANSACTION_PROCESSED',
          count: count.toString(),
        },
        android: {
          priority: 'high',
          notification: {
            channelId: 'transactions',
            icon: 'notification_icon',
            color: '#10b981', // Emerald color
          },
        },
        webpush: {
          notification: {
            icon: '/android-chrome-192x192.png',
            badge: '/favicon-32x32.png',
          },
        },
      };

      const response = await admin.messaging().sendEachForMulticast(message);

      this.logger.log(
        `Sent bundled notification to user ${userId}. Success: ${response.successCount}, Failure: ${response.failureCount}`,
      );

      // Clean up invalid tokens
      if (response.failureCount > 0) {
        const tokensToRemove: string[] = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success && resp.error) {
            const code = resp.error.code;
            if (
              code === 'messaging/invalid-registration-token' ||
              code === 'messaging/registration-token-not-registered'
            ) {
              tokensToRemove.push(registrationTokens[idx]!);
            }
          }
        });

        if (tokensToRemove.length > 0) {
          await this.prisma.fcmToken.deleteMany({
            where: { token: { in: tokensToRemove } },
          });
          this.logger.log(
            `Removed ${tokensToRemove.length} invalid FCM tokens for user ${userId}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Failed to send push notification to user ${userId}`,
        error,
      );
    }
  }
}
