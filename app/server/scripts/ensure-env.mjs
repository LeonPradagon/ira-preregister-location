import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const target = resolve(process.cwd(), '.env');
const example = resolve(process.cwd(), '.env.example');

if (!existsSync(target) && existsSync(example)) {
  copyFileSync(example, target);
  console.warn('[config] app/server/.env was missing; created it from .env.example for local development.');
}

// A rotating development tunnel must be configured on the server because
// verification links and WhatsApp messages are generated there. The frontend
// is same-origin and must not carry a second tunnel hostname in VITE_* env.
if (existsSync(target)) {
  const webEnvPath = resolve(process.cwd(), '..', 'web', '.env');
  const webEnv = existsSync(webEnvPath) ? readFileSync(webEnvPath, 'utf8') : '';
  const webTunnelHost = webEnv.match(/^VITE_TUNNEL_HOST=(.*)$/m)?.[1]?.trim();
  if (webTunnelHost) {
    console.warn(
      `[config] Ignoring stale VITE_TUNNEL_HOST (${webTunnelHost}). Set the current tunnel only in app/server/.env as WEB_ORIGIN and BETTER_AUTH_URL.`,
    );
  }
}
