import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export async function sha256Hex(input: string): Promise<string> {
  return createHash('sha256').update(input).digest('hex');
}

export function randomHex(bytes: number): string {
  return randomBytes(bytes).toString('hex');
}

/** Comparação em tempo constante (compara os digests para igualar tamanhos). */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const da = createHash('sha256').update(a).digest();
  const db = createHash('sha256').update(b).digest();
  return timingSafeEqual(da, db);
}
