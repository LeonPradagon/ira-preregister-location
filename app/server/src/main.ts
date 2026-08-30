import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module.js';
import { loadConfig } from './config/configuration.js';
import { DomainErrorFilter } from './common/domain-error.filter.js';

async function bootstrap() {
  const config = loadConfig();
  const app = await NestFactory.create(AppModule, { cors: { origin: config.WEB_ORIGIN, credentials: true } });
  app.use((request: Request, response: Response, next: NextFunction) => {
    const correlationId = request.header('x-correlation-id') || randomUUID();
    response.setHeader('x-correlation-id', correlationId);
    next();
  });
  app.setGlobalPrefix('v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new DomainErrorFilter());
  await app.listen(config.PORT, '0.0.0.0');
}

bootstrap().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
