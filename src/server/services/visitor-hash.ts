import type { Database } from '../db';
import { randomHex, sha256Hex } from '../lib/crypto';
import { localDay } from '../lib/period';

/**
 * Salt aleatório por dia (fuso de São Paulo), guardado no banco e apagado
 * depois de 2 dias. Sem o salt, não há como recalcular hashes antigos a partir
 * de um IP — o hash só serve para contar visitantes únicos aproximados no dia.
 */
const saltCache = new Map<string, string>();

async function dailySalt(db: Database, day: string): Promise<string> {
  const cached = saltCache.get(day);
  if (cached) return cached;

  // INSERT OR IGNORE + SELECT: se dois scans chegarem juntos, ambos usam o mesmo salt.
  await db.prepare('INSERT OR IGNORE INTO daily_salts (day, salt) VALUES (?1, ?2)').bind(day, randomHex(32)).run();
  const row = await db.prepare('SELECT salt FROM daily_salts WHERE day = ?1').bind(day).first<{ salt: string }>();
  if (!row) throw new Error('daily_salt_missing');

  const twoDaysAgo = localDay(new Date(Date.now() - 2 * 86_400_000));
  await db.prepare('DELETE FROM daily_salts WHERE day < ?1').bind(twoDaysAgo).run();

  saltCache.clear(); // mantém só o salt do dia em memória
  saltCache.set(day, row.salt);
  return row.salt;
}

export async function visitorHash(db: Database, ip: string, userAgent: string, now = new Date()): Promise<string> {
  const salt = await dailySalt(db, localDay(now));
  return sha256Hex(`${salt}|${ip}|${userAgent}`);
}
