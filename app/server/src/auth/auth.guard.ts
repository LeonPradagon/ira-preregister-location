import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from './auth.js';
import { db } from '../db/client.js';
import { authUsers } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';

@Injectable()
export class BetterAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session?.user) throw new UnauthorizedException();
    const [user] = await db
      .select({ disabledAt: authUsers.disabledAt })
      .from(authUsers)
      .where(eq(authUsers.id, session.user.id))
      .limit(1);
    if (!user || user.disabledAt) throw new UnauthorizedException('Akun sudah dinonaktifkan.');

    request.admin = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: (session.user as typeof session.user & { role: string }).role,
    };
    return true;
  }
}
