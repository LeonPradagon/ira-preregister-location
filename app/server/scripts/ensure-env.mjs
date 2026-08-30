import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const target = resolve(process.cwd(), '.env');
const example = resolve(process.cwd(), '.env.example');

if (!existsSync(target) && existsSync(example)) {
  copyFileSync(example, target);
  console.warn('[config] app/server/.env was missing; created it from .env.example for local development.');
}
