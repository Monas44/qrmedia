// Popula o banco local com 5 links e ~6.000 scans fictícios dos últimos 90 dias.
// Uso: npm run db:seed   (usa DATABASE_PATH, padrão ./data/qr.db)
import { resolve } from 'node:path';
import { migrate, openDatabase, type SqlValue, type Statement } from '../src/server/db';

// PRNG determinístico (mulberry32) para o seed ser reproduzível.
let state = 20261017;
const rand = () => {
  state |= 0;
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
function pick<T>(weighted: [T, number][]): T {
  const total = weighted.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [value, w] of weighted) if ((r -= w) <= 0) return value;
  return weighted[weighted.length - 1]![0];
}
const hex = (n: number) => Array.from({ length: n }, () => Math.floor(rand() * 16).toString(16)).join('');

const now = Date.now();
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

interface SeedLink {
  slug: string;
  title: string;
  url: string;
  tags: string[];
  weight: number;
  utm: [string | null, string | null, string | null];
  expired?: boolean;
}

const LINKS: SeedLink[] = [
  { slug: 'cardapio', title: 'Cardápio — Loja Centro', url: 'https://exemplo.com.br/cardapio', tags: ['restaurante', 'loja-centro'], weight: 5, utm: ['qrcode', 'mesa', null] },
  { slug: 'black-friday', title: 'Black Friday 2026', url: 'https://exemplo.com.br/promo/black-friday', tags: ['campanha', 'varejo'], weight: 3, utm: ['qrcode', 'cartaz', 'black-friday-2026'] },
  { slug: 'evento-sp', title: 'Inscrição — Meetup São Paulo', url: 'https://exemplo.com.br/eventos/meetup-sp', tags: ['evento'], weight: 2, utm: [null, null, null] },
  { slug: 'cartao-visita', title: 'Cartão de visita', url: 'https://exemplo.com.br/contato', tags: ['pessoal'], weight: 1, utm: [null, null, null] },
  { slug: 'natal-2025', title: 'Campanha de Natal (encerrada)', url: 'https://exemplo.com.br/natal', tags: ['campanha'], weight: 0, utm: [null, null, null], expired: true },
];

const DEVICES: [{ device: string; os: string | null; browser: string | null }, number][] = [
  [{ device: 'mobile', os: 'Android', browser: 'Chrome' }, 38],
  [{ device: 'mobile', os: 'iOS', browser: 'Mobile Safari' }, 30],
  [{ device: 'mobile', os: 'Android', browser: 'Samsung Browser' }, 7],
  [{ device: 'mobile', os: 'iOS', browser: 'Chrome' }, 4],
  [{ device: 'tablet', os: 'iOS', browser: 'Mobile Safari' }, 4],
  [{ device: 'tablet', os: 'Android', browser: 'Chrome' }, 2],
  [{ device: 'desktop', os: 'Windows', browser: 'Chrome' }, 8],
  [{ device: 'desktop', os: 'Windows', browser: 'Edge' }, 3],
  [{ device: 'desktop', os: 'macOS', browser: 'Safari' }, 3],
  [{ device: 'desktop', os: 'Linux', browser: 'Firefox' }, 1],
];
const LANGS: [string | null, number][] = [['pt-BR', 82], ['pt-PT', 3], ['en-US', 8], ['es-AR', 3], ['es-ES', 1], [null, 3]];
const REFS: [string | null, number][] = [[null, 80], ['instagram.com', 8], ['l.facebook.com', 4], ['www.google.com', 4], ['t.co', 2], ['linktr.ee', 2]];
// Distribuição por hora (horário de Brasília): almoço e noite.
const HOUR_W = [0.3, 0.2, 0.1, 0.1, 0.1, 0.2, 0.5, 1, 1.5, 2, 2.5, 3.5, 5, 4.5, 3, 2.5, 2.5, 3, 4, 5, 5.5, 4.5, 2.5, 1].map(
  (w, h) => [h, w] as [number, number],
);

const dbPath = process.env.DATABASE_PATH ?? './data/qr.db';
const db = openDatabase(dbPath);
migrate(db, resolve('./migrations'));

const statements: Statement[] = [
  db.prepare(`DELETE FROM links WHERE slug IN (${LINKS.map(() => '?').join(', ')})`).bind(...LINKS.map((l) => l.slug)),
];

LINKS.forEach((l, i) => {
  const created = iso(now - (95 - i * 3) * DAY);
  statements.push(
    db
      .prepare(
        `INSERT INTO links (slug, destination_url, title, tags, utm_source, utm_medium, utm_campaign, is_active, expires_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      )
      .bind(l.slug, l.url, l.title, JSON.stringify(l.tags), ...l.utm, l.expired ? iso(now - 20 * DAY) : null, created, created),
  );
});
statements.push(
  db
    .prepare(
      `INSERT INTO link_history (link_id, old_url, new_url, changed_at)
       SELECT id, 'https://exemplo.com.br/cardapio-antigo.pdf', destination_url, ? FROM links WHERE slug = 'cardapio'`,
    )
    .bind(iso(now - 40 * DAY)),
);

const insertScan = `INSERT INTO scans (link_id, ts, device_type, os, browser, referrer, language, visitor_hash, is_bot)
  VALUES ((SELECT id FROM links WHERE slug = ?), ?, ?, ?, ?, ?, ?, ?, ?)`;
const visitors: string[] = [];
const totalWeight = LINKS.reduce((s, l) => s + l.weight, 0);
const localMidnight = Math.floor((now - 3 * 3600_000) / DAY) * DAY + 3 * 3600_000;
let count = 0;

for (const link of LINKS) {
  const n = link.expired ? 350 : Math.round((6000 * link.weight) / totalWeight);
  for (let k = 0; k < n; k++) {
    // Mais scans recentes (curva de crescimento).
    const daysAgo = link.expired ? 25 + Math.floor(rand() * 60) : Math.floor(Math.pow(rand(), 1.35) * 90);
    const hour = pick(HOUR_W);
    const ts = localMidnight - daysAgo * DAY + (hour * 60 + Math.floor(rand() * 60)) * 60_000 + Math.floor(rand() * 60_000);
    if (ts > now) continue;

    const isBot = rand() < 0.08;
    const dev = isBot ? { device: 'desktop', os: null, browser: null } : pick(DEVICES);
    // ~30% de retornos do mesmo visitante.
    let hash: string;
    if (!isBot && visitors.length && rand() < 0.3) hash = visitors[Math.floor(rand() * visitors.length)]!;
    else {
      hash = hex(64);
      if (!isBot) visitors.push(hash);
      if (visitors.length > 400) visitors.shift();
    }

    const values: SqlValue[] = [
      link.slug, iso(ts), dev.device, dev.os, dev.browser,
      isBot ? null : pick(REFS), isBot ? null : pick(LANGS), hash, isBot ? 1 : 0,
    ];
    statements.push(db.prepare(insertScan).bind(...values));
    count++;
  }
}

await db.batch(statements);
db.close();
console.log(`Seed aplicado em ${dbPath}: ${LINKS.length} links, ${count} scans.`);
