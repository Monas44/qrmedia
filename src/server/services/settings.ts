import type { Database } from '../db';

/**
 * Configurações gerais, lidas do banco na inicialização e mantidas em memória
 * (o redirect consulta a cada scan; uma única instância mantém tudo coerente).
 */
export class SettingsStore {
  analyticsPaused = false;

  async load(db: Database): Promise<void> {
    const row = await db.prepare("SELECT value FROM settings WHERE key = 'analytics_paused'").first<{ value: string }>();
    this.analyticsPaused = row?.value === '1';
  }

  async setAnalyticsPaused(db: Database, paused: boolean): Promise<void> {
    await db
      .prepare("INSERT INTO settings (key, value) VALUES ('analytics_paused', ?1) ON CONFLICT (key) DO UPDATE SET value = excluded.value")
      .bind(paused ? '1' : '0')
      .run();
    this.analyticsPaused = paused;
  }
}
