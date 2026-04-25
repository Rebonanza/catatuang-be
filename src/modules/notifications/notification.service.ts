import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { PrismaService } from '../../prisma/prisma.service';
import { Subject, Subscription } from 'rxjs';
import { bufferTime, filter, groupBy, mergeMap } from 'rxjs/operators';
import { NotificationType } from '../../common/constants/notification.constant';

export interface NotificationPayload {
  userId: string;
  type: NotificationType;
  title?: string;
  body?: string;
}

@Injectable()
export class NotificationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationService.name);
  private firebaseApp: admin.app.App | null = null;
  private readonly notificationSubject = new Subject<NotificationPayload>();
  private notificationSubscription: Subscription;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.setupNotificationBundling();
  }

  onModuleInit() {
    this.initializeFirebase();
  }

  onModuleDestroy() {
    if (this.notificationSubscription) {
      this.notificationSubscription.unsubscribe();
    }
    this.notificationSubject.complete();
  }

  private initializeFirebase() {
    if (admin.apps.length > 0) {
      this.firebaseApp = admin.app();
      return;
    }

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
    } catch (error: unknown) {
      this.logger.error('Failed to initialize Firebase Admin', error);
    }
  }

  private setupNotificationBundling() {
    this.notificationSubscription = this.notificationSubject
      .asObservable()
      .pipe(
        groupBy((payload) => payload.userId),
        mergeMap((group$) =>
          group$.pipe(
            bufferTime(10000),
            filter((notifications) => notifications.length > 0),
          ),
        ),
        mergeMap(async (notifications) => {
          try {
            await this.processBundledNotifications(notifications);
          } catch (error: unknown) {
            this.logger.error('Error processing bundled notifications', error);
          }
        }),
      )
      .subscribe({
        error: (err: unknown) => {
          this.logger.error('Fatal error in notification stream', err);
        },
      });
  }

  private async processBundledNotifications(
    notifications: NotificationPayload[],
  ) {
    if (notifications.length === 0) return;

    const userId = notifications[0].userId;
    const count = notifications.length;
    const type = notifications[0].type;

    let title = 'Notifikasi';
    let body = `Kamu memiliki ${count} pembaruan baru.`;

    if (type === NotificationType.TRANSACTION_PROCESSED) {
      title = 'Transaksi Terproses';
      body =
        count > 1
          ? `${count} transaksi baru telah berhasil diproses.`
          : 'Satu transaksi baru telah berhasil diproses.';
    }

    await this.sendPushNotification(userId, { title, body, type, count });
  }

  async saveToken(userId: string, token: string) {
    try {
      await this.prisma.fcmToken.upsert({
        where: { token },
        update: { userId, updatedAt: new Date() },
        create: { userId, token },
      });
    } catch (error: unknown) {
      this.logger.error(`Failed to save FCM token for user ${userId}`, error);
    }
  }

  notifyUser(payload: NotificationPayload) {
    this.notificationSubject.next(payload);
  }

  private async sendPushNotification(
    userId: string,
    data: { title: string; body: string; type: string; count: number },
  ) {
    if (!this.firebaseApp) {
      this.logger.warn('Firebase is not initialized. Skipping notification.');
      return;
    }

    try {
      const tokens = await this.prisma.fcmToken.findMany({
        where: { userId },
        select: { token: true },
      });

      if (tokens.length === 0) return;

      const registrationTokens = tokens.map((t) => t.token);

      const message: admin.messaging.MulticastMessage = {
        tokens: registrationTokens,
        notification: {
          title: data.title,
          body: data.body,
        },
        data: {
          type: data.type,
          count: data.count.toString(),
        },
        android: {
          priority: 'high',
          notification: {
            channelId: 'transactions',
            icon: 'notification_icon',
            color: '#10b981',
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
        `Push Notification: Sent ${data.count} bundled events to User ID: ${userId}. Success: ${response.successCount}, Failure: ${response.failureCount}`,
      );

      if (response.failureCount > 0) {
        await this.cleanupInvalidTokens(
          userId,
          registrationTokens,
          response.responses,
        );
      }
    } catch (error: unknown) {
      this.logger.error(
        `Failed to send push notification to user ${userId}`,
        error,
      );
    }
  }

  private async cleanupInvalidTokens(
    userId: string,
    tokens: string[],
    responses: admin.messaging.SendResponse[],
  ) {
    const tokensToRemove: string[] = [];

    responses.forEach((resp, idx) => {
      if (!resp.success && resp.error) {
        const code = resp.error.code;
        if (
          code === 'messaging/invalid-registration-token' ||
          code === 'messaging/registration-token-not-registered'
        ) {
          tokensToRemove.push(tokens[idx]);
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
}
