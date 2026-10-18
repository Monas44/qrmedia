export interface RedirectRecord {
  id: number;
  url: string; // destino final, já com UTMs
  active: boolean;
  expires_at: string | null;
  /** false quando a coleta deste link está pausada. */
  track: boolean;
}

/**
 * Cache em memória dos slugs mais acessados. Com uma única instância, a
 * invalidação na escrita é imediata. Limitado em tamanho (descarta o mais antigo).
 */
export class RedirectCache {
  private readonly map = new Map<string, RedirectRecord>();

  constructor(private readonly maxEntries = 10_000) {}

  get(slug: string): RedirectRecord | undefined {
    const hit = this.map.get(slug);
    if (hit) {
      // reinsere para manter ordem de uso (LRU simples)
      this.map.delete(slug);
      this.map.set(slug, hit);
    }
    return hit;
  }

  set(slug: string, record: RedirectRecord): void {
    this.map.delete(slug);
    this.map.set(slug, record);
    if (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
  }

  delete(slug: string): void {
    this.map.delete(slug);
  }

  clear(): void {
    this.map.clear();
  }
}
