// Recria links em lote a partir de um CSV, mantendo os slugs (os QR impressos voltam a funcionar).
//
// Uso:
//   npx tsx scripts/import-links.ts links.csv https://SEU-APP.up.railway.app SEU_API_TOKEN
//
// CSV (separador vírgula ou ponto e vírgula; primeira linha = cabeçalho):
//   slug,destino,titulo,tags,utm_source,utm_medium,utm_campaign
//   sap24r,https://empresa.com.br,Empresa X — Motorista 042,empresa-x|m042,automedia,qrcode-carro,empresa-x-out26
//
// Só slug e destino são obrigatórios. Tags separadas por "|". Links que já existem são pulados.
import { readFileSync } from 'node:fs';

const [file, baseArg, token] = process.argv.slice(2);
if (!file || !baseArg || !token) {
  console.error('Uso: npx tsx scripts/import-links.ts <arquivo.csv> <url-do-app> <API_TOKEN>');
  process.exit(1);
}
const base = baseArg.replace(/\/+$/, '');

function parseCsv(text: string): string[][] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const sep = (lines[0] ?? '').includes(';') ? ';' : ',';
  return lines.map((line) => {
    const cells: string[] = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') (cur += '"'), i++;
        else if (ch === '"') quoted = false;
        else cur += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === sep) cells.push(cur.trim()), (cur = '');
      else cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  });
}

const [header, ...rows] = parseCsv(readFileSync(file, 'utf8'));
const col = (name: string) => header!.findIndex((h) => h.toLowerCase() === name);
const idx = {
  slug: col('slug'),
  destino: Math.max(col('destino'), col('destination_url')),
  titulo: Math.max(col('titulo'), col('título'), col('title')),
  tags: col('tags'),
  utm_source: col('utm_source'),
  utm_medium: col('utm_medium'),
  utm_campaign: col('utm_campaign'),
};
if (idx.slug < 0 || idx.destino < 0) {
  console.error('O CSV precisa das colunas "slug" e "destino".');
  process.exit(1);
}
const get = (row: string[], i: number) => (i >= 0 ? row[i]?.trim() || undefined : undefined);

let created = 0;
let skipped = 0;
let failed = 0;
for (const row of rows) {
  const slug = get(row, idx.slug)?.toLowerCase();
  const destination = get(row, idx.destino);
  if (!slug || !destination) continue;
  const body = {
    slug,
    destination_url: destination,
    title: get(row, idx.titulo) ?? null,
    tags: get(row, idx.tags)?.split('|').map((t) => t.trim()).filter(Boolean) ?? [],
    utm_source: get(row, idx.utm_source) ?? null,
    utm_medium: get(row, idx.utm_medium) ?? null,
    utm_campaign: get(row, idx.utm_campaign) ?? null,
  };
  const res = await fetch(`${base}/api/links`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as { ok: boolean; data?: { short_url: string }; error?: { code: string; message: string } } | null;
  if (res.ok && json?.ok) {
    created++;
    console.log(`✔ ${slug} → ${json.data!.short_url}`);
  } else if (json?.error?.code === 'slug_taken') {
    skipped++;
    console.log(`= ${slug} já existe, pulado`);
  } else {
    failed++;
    console.log(`✘ ${slug}: ${json?.error?.message ?? `HTTP ${res.status}`}`);
  }
}
console.log(`\nCriados: ${created} · já existiam: ${skipped} · falharam: ${failed}`);
process.exitCode = failed ? 1 : 0;
