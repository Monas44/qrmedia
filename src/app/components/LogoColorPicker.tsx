import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { cx, Icon, Segmented } from './ui';

export type ColorTarget = 'fg' | 'cornerColor' | 'bg';

const TARGETS: { value: ColorTarget; label: string }[] = [
  { value: 'fg', label: 'Pontos' },
  { value: 'cornerColor', label: 'Cantos' },
  { value: 'bg', label: 'Fundo' },
];

const SAMPLE_SIZE = 256; // a logo é reduzida para esta dimensão antes de ler os pixels
const MAX_SWATCHES = 8;

const toHex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

// ---------- conta-gotas nativo (Chrome/Edge) ----------

interface EyeDropperResult {
  sRGBHex: string;
}
interface EyeDropperCtor {
  new (): { open: () => Promise<EyeDropperResult> };
}
const nativeEyeDropper = (): EyeDropperCtor | undefined => (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper;

export const hasNativeEyeDropper = () => typeof window !== 'undefined' && Boolean(nativeEyeDropper());

/** Abre o conta-gotas do navegador (pega cor de qualquer ponto da tela). Null se cancelado. */
export async function pickScreenColor(): Promise<string | null> {
  const Ctor = nativeEyeDropper();
  if (!Ctor) return null;
  try {
    const { sRGBHex } = await new Ctor().open();
    // Alguns navegadores devolvem "rgb(r, g, b)" em vez de hex.
    const rgb = sRGBHex.match(/\d+/g);
    return sRGBHex.startsWith('#') ? sRGBHex.toLowerCase() : rgb ? toHex(+rgb[0]!, +rgb[1]!, +rgb[2]!) : null;
  } catch {
    return null; // usuário apertou Esc
  }
}

// ---------- extração de cores ----------

/** Cores predominantes: agrupa pixels opacos em faixas e une tons muito próximos. */
function dominantColors(img: ImageData): string[] {
  const buckets = new Map<number, { r: number; g: number; b: number; n: number }>();
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3]! < 128) continue; // ignora transparência
    const r = d[i]!, g = d[i + 1]!, b = d[i + 2]!;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      bucket.n++;
    } else buckets.set(key, { r, g, b, n: 1 });
  }

  const ranked = [...buckets.values()].sort((a, b) => b.n - a.n).map((c) => [c.r / c.n, c.g / c.n, c.b / c.n] as const);
  const picked: (readonly [number, number, number])[] = [];
  for (const c of ranked) {
    if (picked.every((p) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) > 48)) picked.push(c);
    if (picked.length === MAX_SWATCHES) break;
  }
  return picked.map(([r, g, b]) => toHex(Math.round(r), Math.round(g), Math.round(b)));
}

function useLogoPixels(src: string) {
  const [pixels, setPixels] = useState<ImageData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPixels(null);
    setFailed(false);
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const w = img.naturalWidth || SAMPLE_SIZE;
      const h = img.naturalHeight || SAMPLE_SIZE;
      const scale = Math.min(1, SAMPLE_SIZE / Math.max(w, h));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      try {
        ctx!.drawImage(img, 0, 0, canvas.width, canvas.height);
        setPixels(ctx!.getImageData(0, 0, canvas.width, canvas.height));
      } catch {
        setFailed(true); // ex.: SVG que o navegador não deixa ler
      }
    };
    img.onerror = () => !cancelled && setFailed(true);
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  return { pixels, failed };
}

// ---------- componente ----------

export function LogoColorPicker({
  logo,
  current,
  onPick,
}: {
  logo: string;
  current: Record<ColorTarget, string>;
  onPick: (target: ColorTarget, hex: string) => void;
}) {
  const [target, setTarget] = useState<ColorTarget>('fg');
  const [hover, setHover] = useState<string | null>(null);
  const { pixels, failed } = useLogoPixels(logo);
  const [swatches, setSwatches] = useState<string[]>([]);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => setSwatches(pixels ? dominantColors(pixels) : []), [pixels]);

  /** Cor do pixel sob o cursor, considerando o object-contain da imagem. */
  const colorAt = (e: MouseEvent<HTMLImageElement>): string | null => {
    const el = imgRef.current;
    if (!el || !pixels) return null;
    const box = el.getBoundingClientRect();
    const ratio = Math.min(box.width / pixels.width, box.height / pixels.height);
    const drawnW = pixels.width * ratio;
    const drawnH = pixels.height * ratio;
    const x = Math.floor((e.clientX - box.left - (box.width - drawnW) / 2) / ratio);
    const y = Math.floor((e.clientY - box.top - (box.height - drawnH) / 2) / ratio);
    if (x < 0 || y < 0 || x >= pixels.width || y >= pixels.height) return null;
    const i = (y * pixels.width + x) * 4;
    if (pixels.data[i + 3]! < 128) return null; // pixel transparente
    return toHex(pixels.data[i]!, pixels.data[i + 1]!, pixels.data[i + 2]!);
  };

  const targetLabel = TARGETS.find((t) => t.value === target)!.label.toLowerCase();

  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-ink">Conta-gotas: aplicar em</span>
        <Segmented ariaLabel="Campo que recebe a cor" value={target} onChange={setTarget} options={TARGETS} />
      </div>

      {failed ? (
        <p className="text-sm text-muted">Não foi possível ler as cores desta imagem. Use o conta-gotas de cada campo de cor.</p>
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex shrink-0 flex-col items-center gap-1.5">
            <img
              ref={imgRef}
              src={logo}
              alt="Logo: clique para pegar uma cor"
              onMouseMove={(e) => setHover(colorAt(e))}
              onMouseLeave={() => setHover(null)}
              onClick={(e) => {
                const hex = colorAt(e);
                if (hex) onPick(target, hex);
              }}
              className="size-36 cursor-crosshair rounded-lg border border-line object-contain p-1"
              style={{ backgroundImage: 'repeating-conic-gradient(var(--surface-2) 0 25%, transparent 0 50%)', backgroundSize: '16px 16px' }}
            />
            <span className="flex h-5 items-center gap-1.5 text-xs text-muted" aria-live="polite">
              {hover ? (
                <>
                  <span className="size-3 rounded-sm border border-line" style={{ background: hover }} />
                  <span className="tabular uppercase">{hover}</span>
                </>
              ) : (
                'Clique na logo'
              )}
            </span>
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <span className="text-xs text-muted">Cores da logo (clique para usar em {targetLabel})</span>
            <div className="flex flex-wrap gap-2">
              {swatches.map((hex) => {
                const active = current[target].toLowerCase() === hex;
                return (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => onPick(target, hex)}
                    title={`Usar ${hex.toUpperCase()} em ${targetLabel}`}
                    aria-label={`Usar ${hex.toUpperCase()} em ${targetLabel}`}
                    aria-pressed={active}
                    className={cx(
                      'flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs text-ink-2 hover:bg-surface-2',
                      active ? 'border-accent' : 'border-line',
                    )}
                  >
                    <span className="size-5 rounded border border-line" style={{ background: hex }} />
                    <span className="tabular uppercase">{hex}</span>
                    {active && <Icon name="check" className="size-3.5 text-accent" />}
                  </button>
                );
              })}
              {pixels && swatches.length === 0 && <span className="text-sm text-muted">A logo não tem áreas opacas.</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
