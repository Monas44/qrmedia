import { useState, type FormEvent, type KeyboardEvent } from 'react';
import type { LinkDTO, LinkInput } from '@shared/types';
import { Alert, Button, Field, Icon, Input, Toggle } from './ui';

export interface LinkFormValues {
  destination_url: string;
  slug: string;
  title: string;
  tags: string[];
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  is_active: boolean;
  expires_at: string; // datetime-local (fuso do navegador)
}

function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function initialValues(link?: LinkDTO): LinkFormValues {
  return {
    destination_url: link?.destination_url ?? '',
    slug: link?.slug ?? '',
    title: link?.title ?? '',
    tags: link?.tags ?? [],
    utm_source: link?.utm_source ?? '',
    utm_medium: link?.utm_medium ?? '',
    utm_campaign: link?.utm_campaign ?? '',
    is_active: link?.is_active ?? true,
    expires_at: isoToLocalInput(link?.expires_at ?? null),
  };
}

export function toPayload(v: LinkFormValues, includeSlug: boolean): LinkInput {
  return {
    destination_url: v.destination_url.trim(),
    ...(includeSlug && v.slug.trim() ? { slug: v.slug.trim().toLowerCase() } : {}),
    title: v.title.trim() || null,
    tags: v.tags,
    utm_source: v.utm_source.trim() || null,
    utm_medium: v.utm_medium.trim() || null,
    utm_campaign: v.utm_campaign.trim() || null,
    is_active: v.is_active,
    expires_at: v.expires_at ? new Date(v.expires_at).toISOString() : null,
  };
}

function validUrl(value: string): boolean {
  try {
    const u = new URL(value.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function TagInput({ value, onChange }: { value: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const add = (raw: string) => {
    const tag = raw.trim().toLowerCase().slice(0, 32);
    if (tag && !value.includes(tag) && value.length < 20) onChange([...value, tag]);
    setDraft('');
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(draft);
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };
  return (
    <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1.5 focus-within:outline-2 focus-within:outline-accent">
      {value.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-0.5 text-xs text-ink">
          {t}
          <button type="button" aria-label={`Remover tag ${t}`} onClick={() => onChange(value.filter((x) => x !== t))} className="text-muted hover:text-ink">
            <Icon name="x" className="size-3" />
          </button>
        </span>
      ))}
      <input
        id="tags"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={() => draft && add(draft)}
        placeholder={value.length ? '' : 'evento, cardápio…'}
        className="h-7 min-w-24 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
      />
    </div>
  );
}

export function LinkForm({
  initial,
  mode,
  baseUrl,
  submitLabel,
  onSubmit,
}: {
  initial: LinkFormValues;
  mode: 'create' | 'edit';
  baseUrl: string;
  submitLabel: string;
  onSubmit: (values: LinkFormValues) => Promise<void>;
}) {
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showUtm, setShowUtm] = useState(Boolean(initial.utm_source || initial.utm_medium || initial.utm_campaign));
  const set = <K extends keyof LinkFormValues>(k: K, val: LinkFormValues[K]) => setV((s) => ({ ...s, [k]: val }));

  const urlInvalid = v.destination_url.trim() !== '' && !validUrl(v.destination_url);
  const slugInvalid = mode === 'create' && v.slug !== '' && !/^[a-z0-9][a-z0-9_-]{2,63}$/.test(v.slug.toLowerCase());

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (urlInvalid || slugInvalid) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(v);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <Field
        label="URL de destino"
        htmlFor="destination_url"
        hint={urlInvalid ? <span className="text-bad">Use uma URL completa começando com http:// ou https://</span> : 'Pode ser alterada a qualquer momento sem trocar o QR code.'}
      >
        <Input
          id="destination_url"
          type="url"
          required
          inputMode="url"
          placeholder="https://meusite.com.br/promo"
          value={v.destination_url}
          onChange={(e) => set('destination_url', e.target.value)}
          aria-invalid={urlInvalid}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Título" htmlFor="title" hint="Só para você identificar o link no painel.">
          <Input id="title" maxLength={200} placeholder="Cardápio da loja Centro" value={v.title} onChange={(e) => set('title', e.target.value)} />
        </Field>
        {mode === 'create' ? (
          <Field
            label="Slug (opcional)"
            htmlFor="slug"
            hint={slugInvalid ? <span className="text-bad">3–64 caracteres: letras minúsculas, números, - ou _</span> : 'Vazio = gerado automaticamente (6 caracteres). Não pode ser alterado depois.'}
          >
            <div className="flex min-w-0 items-center rounded-lg border border-line bg-surface focus-within:outline-2 focus-within:outline-accent">
              <span className="shrink-0 truncate pl-3 text-sm text-muted">{baseUrl.replace(/^https?:\/\//, '')}/</span>
              <input
                id="slug"
                value={v.slug}
                onChange={(e) => set('slug', e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                placeholder="cardapio"
                maxLength={64}
                className="h-10 min-w-0 flex-1 bg-transparent pr-3 text-sm text-ink outline-none placeholder:text-muted"
              />
            </div>
          </Field>
        ) : (
          <Field label="Slug" hint="Fixo: é o endereço gravado no QR code.">
            <Input value={`${baseUrl.replace(/^https?:\/\//, '')}/${v.slug}`} readOnly disabled />
          </Field>
        )}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Tags" htmlFor="tags" hint="Enter ou vírgula para adicionar.">
          <TagInput value={v.tags} onChange={(tags) => set('tags', tags)} />
        </Field>
        <Field label="Expira em (opcional)" htmlFor="expires_at" hint="Depois desta data o link responde 410 (expirado).">
          <div className="flex gap-2">
            <Input id="expires_at" type="datetime-local" value={v.expires_at} onChange={(e) => set('expires_at', e.target.value)} />
            {v.expires_at && (
              <Button variant="ghost" onClick={() => set('expires_at', '')} aria-label="Remover expiração">
                <Icon name="x" className="size-4" />
              </Button>
            )}
          </div>
        </Field>
      </div>

      <div className="rounded-lg border border-line">
        <button type="button" onClick={() => setShowUtm((s) => !s)} aria-expanded={showUtm} className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-ink">
          Parâmetros UTM
          <span className="text-xs font-normal text-muted">{showUtm ? 'ocultar' : 'adicionar ao destino'}</span>
        </button>
        {showUtm && (
          <div className="grid gap-4 border-t border-line p-4 sm:grid-cols-3">
            <Field label="utm_source" htmlFor="utm_source">
              <Input id="utm_source" placeholder="qrcode" maxLength={100} value={v.utm_source} onChange={(e) => set('utm_source', e.target.value)} />
            </Field>
            <Field label="utm_medium" htmlFor="utm_medium">
              <Input id="utm_medium" placeholder="impresso" maxLength={100} value={v.utm_medium} onChange={(e) => set('utm_medium', e.target.value)} />
            </Field>
            <Field label="utm_campaign" htmlFor="utm_campaign">
              <Input id="utm_campaign" placeholder="black-friday" maxLength={100} value={v.utm_campaign} onChange={(e) => set('utm_campaign', e.target.value)} />
            </Field>
            <p className="text-xs text-muted sm:col-span-3">Parâmetros que já existem na URL de destino não são sobrescritos.</p>
          </div>
        )}
      </div>

      <Toggle checked={v.is_active} onChange={(val) => set('is_active', val)} label={v.is_active ? 'Link ativo' : 'Link desativado (responde 404)'} />

      {error && <Alert>{error}</Alert>}

      <div>
        <Button type="submit" variant="primary" disabled={busy || urlInvalid || slugInvalid || !v.destination_url.trim()}>
          {busy ? 'Salvando…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}
