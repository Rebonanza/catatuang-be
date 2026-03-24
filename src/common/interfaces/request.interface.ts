import { Request } from 'express'; // Although using Fastify, Passport's Req type is often easier to extend similarly or use specific ones

export interface AuthenticatedRequest extends Request {
  user: {
    sub: string;
    email: string;
    [key: string]: any;
  };
}

export interface GoogleAuthenticatedRequest extends Request {
  user: {
    accessToken: string;
    refreshToken?: string;
    data?: any;
  };
}
