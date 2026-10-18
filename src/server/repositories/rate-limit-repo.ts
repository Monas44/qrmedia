import type { Database } from '../db';
export interface AttemptWindow {
  count: number;
  window_start: number;
}

export function getAttempts(db: Database, key: string) {
  return db.prepare('SELECT count, window_start FROM login_attempts WHERE key = ?1').bind(key).first<AttemptWindow>();
}

/** Incrementa a janela atual ou abre uma nova se a anterior já expirou. */
export async function registerFailure(db: Database, key: string, now: number, windowMs: number): Promise<void> {
  await db
    .prepare(
      `INSERT INTO login_attempts (key, count, window_start) VALUES (?1, 1, ?2)
       ON CONFLICT (key) DO UPDATE SET
         count = CASE WHEN window_start <= ?3 THEN 1 ELSE count + 1 END,
         window_start = CASE WHEN window_start <= ?3 THEN ?2 ELSE window_start END`,
    )
    .bind(key, now, now - windowMs)
    .run();
}

export async function clearAttempts(db: Database, key: string): Promise<void> {
  await db.prepare('DELETE FROM login_attempts WHERE key = ?1').bind(key).run();
}
