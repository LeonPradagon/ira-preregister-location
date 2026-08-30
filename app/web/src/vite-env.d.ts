/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEMO_ADMIN_PASSWORD?: string;
  readonly VITE_API_URL?: string;
  readonly VITE_API_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
