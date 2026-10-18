import type { Database } from './db';
import type { RedirectCache } from './services/redirect-cache';
import type { BackgroundTasks } from './lib/background';

export interface Env {
  DB: Database;
  /** Cache em memória slug → destino (substitui a leitura do banco no redirect). */
  cache: RedirectCache;
  /** Tarefas que rodam depois da resposta (registro de scans). */
  tasks: BackgroundTasks;
  ADMIN_PASSWORD: string;
  JWT_SECRET: string;
  /** Token opcional para integrações externas (Authorization: Bearer). */
  API_TOKEN?: string;
  PUBLIC_BASE_URL?: string;
  /** Endereço do socket TCP, usado quando não há cabeçalho de proxy. */
  REMOTE_ADDR?: string;
}

export type AppEnv = {
  Bindings: Env;
  Variables: { authMethod: 'session' | 'token' };
};
