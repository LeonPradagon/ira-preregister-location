import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface RequestAdmin {
  id: string;
  email: string;
  name: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'REVIEWER' | 'VIEWER';
}

export const CurrentAdmin = createParamDecorator((_: unknown, context: ExecutionContext): RequestAdmin => {
  return context.switchToHttp().getRequest().admin;
});
