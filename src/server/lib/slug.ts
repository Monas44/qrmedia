// Sem caracteres ambíguos: não usa 0/o, 1/l/i.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export const GENERATED_SLUG_LENGTH = 6;

/** Slugs customizados: 3–64 chars, letras minúsculas, dígitos, - e _. */
export const CUSTOM_SLUG_RE = /^[a-z0-9][a-z0-9_-]{2,63}$/;

/** Caminhos que nunca podem virar slug (rotas do app e arquivos comuns da raiz). */
export const RESERVED_SLUGS = new Set([
  'app', 'api', 'assets', 'admin', 'login', 'logout', 'health', 'healthz', 'static',
  'favicon.ico', 'robots.txt', 'sitemap.xml', 'manifest.json', 'well-known',
]);

export function generateSlug(length = GENERATED_SLUG_LENGTH): string {
  // Amostragem por rejeição para distribuição uniforme.
  const limit = 256 - (256 % ALPHABET.length);
  let out = '';
  while (out.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
    for (const b of bytes) {
      if (b < limit) out += ALPHABET[b % ALPHABET.length];
      if (out.length === length) break;
    }
  }
  return out;
}

export function isValidCustomSlug(slug: string): boolean {
  return CUSTOM_SLUG_RE.test(slug) && !RESERVED_SLUGS.has(slug);
}
