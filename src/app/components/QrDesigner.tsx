import QRCodeStyling, { type CornerDotType, type CornerSquareType, type DotType, type ErrorCorrectionLevel, type Options } from 'qr-code-styling';
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { hasNativeEyeDropper, LogoColorPicker, pickScreenColor } from './LogoColorPicker';
import { Alert, Button, Field, Icon, Select } from './ui';

interface Design {
  fg: string;
  bg: string;
  cornerColor: string;
  dotType: DotType;
  cornerSquareType: CornerSquareType;
  cornerDotType: CornerDotType;
  margin: number; // px na pré-visualização de 300px
  ecl: ErrorCorrectionLevel;
  logo: string | null; // data URL
  logoSize: number; // fração do QR (0.15–0.4)
}

const DEFAULT_DESIGN: Design = {
  fg: '#0b0b0b',
  bg: '#ffffff',
  cornerColor: '#0b0b0b',
  dotType: 'square',
  cornerSquareType: 'square',
  cornerDotType: 'square',
  margin: 12,
  ecl: 'M',
  logo: null,
  logoSize: 0.3,
};

const PREVIEW = 300;
const PNG_SIZE = 2048;
const SVG_SIZE = 1024;
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

const DOT_TYPES: { value: DotType; label: string }[] = [
  { value: 'square', label: 'Quadrado' },
  { value: 'dots', label: 'Pontos' },
  { value: 'rounded', label: 'Arredondado' },
  { value: 'extra-rounded', label: 'Muito arredondado' },
  { value: 'classy', label: 'Clássico' },
  { value: 'classy-rounded', label: 'Clássico arredondado' },
];
const CORNER_SQUARE_TYPES: { value: CornerSquareType; label: string }[] = [
  { value: 'square', label: 'Quadrado' },
  { value: 'extra-rounded', label: 'Arredondado' },
  { value: 'dot', label: 'Círculo' },
];
const CORNER_DOT_TYPES: { value: CornerDotType; label: string }[] = [
  { value: 'square', label: 'Quadrado' },
  { value: 'dot', label: 'Círculo' },
];
const ECL_LABELS: Record<ErrorCorrectionLevel, string> = {
  L: 'L — 7% (QR mais simples)',
  M: 'M — 15% (padrão)',
  Q: 'Q — 25%',
  H: 'H — 30% (necessário com logo)',
};

// ---------- contraste (WCAG) para avisar QR difícil de ler ----------
function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}
function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1! + 0.05) / (l2! + 0.05);
}

const storageKey = (slug: string) => `qr-design:${slug}`;

function loadDesign(slug: string): Design {
  try {
    const raw = localStorage.getItem(storageKey(slug));
    return raw ? { ...DEFAULT_DESIGN, ...(JSON.parse(raw) as Partial<Design>) } : DEFAULT_DESIGN;
  } catch {
    return DEFAULT_DESIGN;
  }
}

function saveDesign(slug: string, d: Design) {
  try {
    // Logos grandes não cabem bem no localStorage; salva só o estilo nesse caso.
    const toSave = d.logo && d.logo.length > 400_000 ? { ...d, logo: null } : d;
    localStorage.setItem(storageKey(slug), JSON.stringify(toSave));
  } catch {
    // armazenamento indisponível: o design vale só para esta sessão
  }
}

function buildOptions(data: string, d: Design, size: number, type: 'svg' | 'canvas'): Options {
  const scale = size / PREVIEW;
  return {
    width: size,
    height: size,
    type,
    data,
    margin: Math.round(d.margin * scale),
    qrOptions: { errorCorrectionLevel: d.logo ? 'H' : d.ecl },
    dotsOptions: { color: d.fg, type: d.dotType },
    backgroundOptions: { color: d.bg },
    cornersSquareOptions: { color: d.cornerColor, type: d.cornerSquareType },
    cornersDotOptions: { color: d.cornerColor, type: d.cornerDotType },
    image: d.logo ?? undefined,
    imageOptions: { hideBackgroundDots: true, imageSize: d.logoSize, margin: Math.round(4 * scale), crossOrigin: 'anonymous', saveAsBlob: true },
  };
}

async function downloadBlob(qr: QRCodeStyling, ext: 'png' | 'svg', name: string) {
  const blob = await qr.getRawData(ext);
  if (!blob || !(blob instanceof Blob)) throw new Error('Falha ao gerar o arquivo.');
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: `${name}.${ext}` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ColorInput({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const [canPick] = useState(hasNativeEyeDropper);
  return (
    <Field label={label} htmlFor={id}>
      <div className="flex h-10 items-center gap-2 rounded-lg border border-line bg-surface pr-1 pl-2">
        <input id={id} type="color" value={value} onChange={(e) => onChange(e.target.value)} className="size-7 cursor-pointer rounded border-0 bg-transparent p-0" />
        <input
          aria-label={`${label} (hex)`}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) onChange(e.target.value.toLowerCase());
          }}
          onBlur={() => setDraft(value)}
          maxLength={7}
          className="tabular w-full min-w-0 bg-transparent text-sm text-ink uppercase outline-none"
        />
        {canPick && (
          <button
            type="button"
            onClick={async () => {
              const hex = await pickScreenColor();
              if (hex) onChange(hex);
            }}
            title="Conta-gotas: pegar uma cor de qualquer lugar da tela"
            aria-label={`Conta-gotas para ${label}`}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-ink-2 hover:bg-surface-2 hover:text-ink"
          >
            <Icon name="pipette" className="size-4" />
          </button>
        )}
      </div>
    </Field>
  );
}

export function QrDesigner({ url, slug }: { url: string; slug: string }) {
  const [design, setDesign] = useState<Design>(() => loadDesign(slug));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'png' | 'svg' | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const qrRef = useRef<QRCodeStyling | null>(null);
  const set = <K extends keyof Design>(k: K, v: Design[K]) => setDesign((d) => ({ ...d, [k]: v }));

  const options = useMemo(() => buildOptions(url, design, PREVIEW, 'svg'), [url, design]);

  useEffect(() => {
    if (!previewRef.current) return;
    if (!qrRef.current) {
      qrRef.current = new QRCodeStyling(options);
      previewRef.current.innerHTML = '';
      qrRef.current.append(previewRef.current);
    } else {
      qrRef.current.update(options);
    }
    saveDesign(slug, design);
  }, [options, slug, design]);

  const lowContrast = contrast(design.fg, design.bg) < 4 || contrast(design.cornerColor, design.bg) < 4;
  const inverted = luminance(design.fg) > luminance(design.bg);

  const onLogo = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return setError('Envie um arquivo de imagem (PNG, JPG, SVG).');
    if (file.size > MAX_LOGO_BYTES) return setError('A logo deve ter no máximo 2 MB.');
    setError(null);
    const reader = new FileReader();
    reader.onload = () => set('logo', String(reader.result));
    reader.readAsDataURL(file);
  };

  const download = async (ext: 'png' | 'svg') => {
    setBusy(ext);
    setError(null);
    try {
      const size = ext === 'png' ? PNG_SIZE : SVG_SIZE;
      const qr = new QRCodeStyling(buildOptions(url, design, size, ext === 'png' ? 'canvas' : 'svg'));
      await downloadBlob(qr, ext, `qr-${slug}${ext === 'png' ? `-${PNG_SIZE}px` : ''}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao gerar o arquivo.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_1fr]">
      <div className="flex flex-col items-center gap-4">
        <div className="rounded-xl border border-line p-3" style={{ background: design.bg }}>
          <div ref={previewRef} className="size-[300px] max-w-full [&>svg]:h-auto [&>svg]:max-w-full" aria-label={`QR code para ${url}`} role="img" />
        </div>
        <p className="max-w-[300px] text-center text-xs break-all text-muted">{url}</p>
        <div className="flex w-full max-w-[326px] gap-2">
          <Button variant="primary" className="flex-1" onClick={() => download('png')} disabled={busy !== null}>
            <Icon name="download" className="size-4" /> {busy === 'png' ? 'Gerando…' : 'PNG 2048px'}
          </Button>
          <Button className="flex-1" onClick={() => download('svg')} disabled={busy !== null}>
            <Icon name="download" className="size-4" /> {busy === 'svg' ? 'Gerando…' : 'SVG'}
          </Button>
        </div>
        {error && <Alert>{error}</Alert>}
      </div>

      <div className="flex min-w-0 flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <ColorInput id="qr-fg" label="Pontos" value={design.fg} onChange={(v) => set('fg', v)} />
          <ColorInput id="qr-corner" label="Cantos" value={design.cornerColor} onChange={(v) => set('cornerColor', v)} />
          <ColorInput id="qr-bg" label="Fundo" value={design.bg} onChange={(v) => set('bg', v)} />
        </div>
        {(lowContrast || inverted) && (
          <Alert tone="warn">
            {inverted
              ? 'Pontos mais claros que o fundo (QR invertido) não são lidos por alguns leitores.'
              : 'Contraste baixo entre pontos e fundo pode dificultar a leitura. Teste antes de imprimir.'}
          </Alert>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Estilo dos pontos" htmlFor="qr-dots">
            <Select id="qr-dots" value={design.dotType} onChange={(e) => set('dotType', e.target.value as DotType)}>
              {DOT_TYPES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Moldura dos cantos" htmlFor="qr-csq">
            <Select id="qr-csq" value={design.cornerSquareType} onChange={(e) => set('cornerSquareType', e.target.value as CornerSquareType)}>
              {CORNER_SQUARE_TYPES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Centro dos cantos" htmlFor="qr-cdot">
            <Select id="qr-cdot" value={design.cornerDotType} onChange={(e) => set('cornerDotType', e.target.value as CornerDotType)}>
              {CORNER_DOT_TYPES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`Margem: ${design.margin}px`} htmlFor="qr-margin" hint="Leitores precisam de uma área livre ao redor do código.">
            <input id="qr-margin" type="range" min={0} max={40} value={design.margin} onChange={(e) => set('margin', Number(e.target.value))} className="accent-[var(--accent)]" />
          </Field>
          <Field label="Correção de erro" htmlFor="qr-ecl" hint={design.logo ? 'Fixado em H porque há logo.' : 'Níveis maiores toleram mais danos, mas geram QR mais denso.'}>
            <Select id="qr-ecl" value={design.logo ? 'H' : design.ecl} disabled={Boolean(design.logo)} onChange={(e) => set('ecl', e.target.value as ErrorCorrectionLevel)}>
              {(Object.keys(ECL_LABELS) as ErrorCorrectionLevel[]).map((k) => (
                <option key={k} value={k}>
                  {ECL_LABELS[k]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="rounded-lg border border-line p-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-2">
              <Icon name="image" className="size-4" />
              {design.logo ? 'Trocar logo' : 'Enviar logo central'}
              <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={onLogo} className="sr-only" />
            </label>
            {design.logo && (
              <>
                <img src={design.logo} alt="Logo atual" className="size-10 rounded border border-line object-contain" />
                <Button variant="ghost" size="sm" onClick={() => set('logo', null)}>
                  Remover
                </Button>
              </>
            )}
          </div>
          {design.logo && (
            <div className="mt-4">
              <Field label={`Tamanho da logo: ${Math.round(design.logoSize * 100)}%`} htmlFor="qr-logo-size">
                <input id="qr-logo-size" type="range" min={15} max={40} value={Math.round(design.logoSize * 100)} onChange={(e) => set('logoSize', Number(e.target.value) / 100)} className="accent-[var(--accent)]" />
              </Field>
            </div>
          )}
          {design.logo && (
            <LogoColorPicker
              logo={design.logo}
              current={{ fg: design.fg, cornerColor: design.cornerColor, bg: design.bg }}
              onPick={(target, hex) => set(target, hex)}
            />
          )}
        </div>

        <div>
          <Button variant="ghost" size="sm" onClick={() => setDesign(DEFAULT_DESIGN)}>
            Restaurar padrão
          </Button>
        </div>
      </div>
    </div>
  );
}
