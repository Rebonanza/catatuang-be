import { ApiResponse } from '../../../common/interfaces/api-response.interface';

export interface GmailStatusData {
  connected: boolean;
  watchValid: boolean;
  lastSyncedAt: Date | null;
}

export interface GmailSyncData {
  processedCount: number;
  message: string;
}

export interface GmailWatchData {
  historyId?: string | null;
  expiration?: string | null;
}

export type GmailStatusResponse = ApiResponse<GmailStatusData>;
export type GmailSyncResponse = ApiResponse<GmailSyncData>;
export type GmailWatchResponse = ApiResponse<GmailWatchData>;
export type GmailActionResponse = ApiResponse<void>;
