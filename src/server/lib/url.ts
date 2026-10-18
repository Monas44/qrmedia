export const MAX_URL_LENGTH = 2048;

/** Aceita apenas URLs absolutas http/https. Retorna a URL normalizada ou null. */
export function normalizeDestination(input: string): string | null {
  const raw = input.trim();
  if (!raw || raw.length > MAX_URL_LENGTH) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!url.hostname || url.username || url.password) return null;
  return url.toString();
}

export interface UtmParams {
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
}

/** Anexa UTMs ao destino sem sobrescrever parâmetros que já existem nele. */
export function buildFinalUrl(destination: string, utm: UtmParams): string {
  const url = new URL(destination);
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign'] as const) {
    const value = utm[key];
    if (value && !url.searchParams.has(key)) url.searchParams.set(key, value);
  }
  return url.toString();
}

/** Reduz o Referer ao hostname: suficiente para analytics e sem caminho/consulta pessoais. */
export function referrerHost(referer: string | null): string | null {
  if (!referer) return null;
  try {
    const host = new URL(referer).hostname.toLowerCase();
    return host ? host.slice(0, 255) : null;
  } catch {
    return null;
  }
}
