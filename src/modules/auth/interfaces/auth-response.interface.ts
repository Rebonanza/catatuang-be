import { ApiResponse } from '../../../common/interfaces/api-response.interface';

// Token response (login, register, refresh, google)
export interface TokenData {
  accessToken: string;
  refreshToken: string;
}

export interface TokenResponse extends ApiResponse<TokenData> {
  success: true;
  data: TokenData;
}

// User profile (getMe)
export interface MeData {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  hasPassword: boolean;
}

export interface MeResponse extends ApiResponse<MeData> {
  success: true;
  data: MeData;
}
