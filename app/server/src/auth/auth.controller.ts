import { Controller, All, Req, Res } from '@nestjs/common';
import { toNodeHandler } from 'better-auth/node';
import type { Request, Response } from 'express';
import { auth } from './auth.js';

@Controller('api/auth')
export class AuthController {
  @All('{*path}')
  handle(@Req() request: Request, @Res() response: Response) {
    return toNodeHandler(auth)(request, response);
  }
}
