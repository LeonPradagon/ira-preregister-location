import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';

let loadedEnvPath: string | undefined;
let loadedEnvMtimeMs = -1;

function candidateEnvPaths() {
  const configuredPath = process.env.WEB_ORIGIN_ENV_FILE?.trim();
  if (configuredPath) return [configuredPath];
  return [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), 'app/server/.env'),
  ].filter((path, index, paths): path is string => Boolean(path) && paths.indexOf(path) === index);
}

/**
 * Refresh only the public origin from a local env file. This deliberately does
 * not load secrets or other runtime settings while a worker is processing jobs.
 * Container deployments without a mounted env file continue to use process.env.
 */
function refreshPublicOriginFromEnvFile() {
  const envPath = candidateEnvPaths().find((path) => existsSync(path));
  if (!envPath) return;

  const mtimeMs = statSync(envPath).mtimeMs;
  if (envPath === loadedEnvPath && mtimeMs === loadedEnvMtimeMs) return;

  const fileEnv = parse(readFileSync(envPath));
  if (fileEnv.WEB_ORIGIN?.trim()) process.env.WEB_ORIGIN = fileEnv.WEB_ORIGIN.trim();
  loadedEnvPath = envPath;
  loadedEnvMtimeMs = mtimeMs;
}

export function getPublicWebOrigin(env: NodeJS.ProcessEnv = process.env): string {
  if (env === process.env) refreshPublicOriginFromEnvFile();

  const rawOrigin = env.WEB_ORIGIN?.trim();
  if (!rawOrigin) throw new Error('WEB_ORIGIN must be configured before creating a public verification link');

  let origin: URL;
  try {
    origin = new URL(rawOrigin);
  } catch {
    throw new Error('WEB_ORIGIN must be a valid absolute URL before creating a public verification link');
  }
  if (origin.protocol !== 'http:' && origin.protocol !== 'https:') {
    throw new Error('WEB_ORIGIN must use http or https before creating a public verification link');
  }

  return origin.origin;
}
