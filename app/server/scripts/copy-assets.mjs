import { cp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const serverRoot = resolve(import.meta.dirname, '..');
const source = resolve(serverRoot, 'src/db/migrations');
const destination = resolve(serverRoot, 'dist/db/migrations');

await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });
