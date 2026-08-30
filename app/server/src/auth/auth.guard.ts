import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from './auth.js';

@Injectable()
export class BetterAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session?.user) throw new UnauthorizedException();

    request.admin = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: (session.user as typeof session.user & { role: string }).role,
    };
    return true;
  }
}
