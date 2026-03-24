import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  getAuthenticateOptions() {
    console.log('GoogleAuthGuard: getAuthenticateOptions called');
    return {
      accessType: 'offline',
      prompt: 'consent',
    };
  }
}
