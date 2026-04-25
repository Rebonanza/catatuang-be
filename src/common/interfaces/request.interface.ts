import { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email?: string;
  };
}

export interface GoogleAuthenticatedRequest extends Request {
  user: {
    accessToken: string;
    refreshToken?: string;
    data?: unknown;
  };
}
