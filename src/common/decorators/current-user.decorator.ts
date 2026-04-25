import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedRequest } from '../interfaces/request.interface';
import { MeData } from '../../modules/auth/interfaces/auth-response.interface';

export const CurrentUser = createParamDecorator(
  (data: keyof MeData | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user as unknown as MeData;

    return data ? user[data] : user;
  },
);
