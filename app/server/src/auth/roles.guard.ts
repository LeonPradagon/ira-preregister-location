import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CAPABILITIES, ROLES_KEY, AdminRole } from '../common/roles.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<AdminRole[]>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (!roles?.length) return true;
    const role = context.switchToHttp().getRequest().admin?.role as AdminRole | undefined;
    if (!role || !roles.includes(role)) throw new ForbiddenException();
    return true;
  }
}

export function roleCan(role: AdminRole, capability: keyof typeof CAPABILITIES): boolean {
  return (CAPABILITIES[capability] as readonly string[]).includes(role);
}
