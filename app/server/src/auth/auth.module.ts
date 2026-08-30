import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { BetterAuthGuard } from './auth.guard.js';
import { RolesGuard } from './roles.guard.js';

@Module({
  controllers: [AuthController],
  providers: [BetterAuthGuard, RolesGuard],
  exports: [BetterAuthGuard, RolesGuard],
})
export class AuthModule {}
