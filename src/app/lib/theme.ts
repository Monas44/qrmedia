import { useEffect, useState } from 'react';

export type ThemePref = 'system' | 'light' | 'dark';

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem('theme');
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;
const THEME_EVENT = 'qr:theme';

export function setThemePref(pref: ThemePref) {
  const root = document.documentElement;
  if (pref === 'system') delete root.dataset.theme;
  else root.dataset.theme = pref;
  try {
    if (pref === 'system') localStorage.removeItem('theme');
    else localStorage.setItem('theme', pref);
  } catch {
    // armazenamento indisponível: vale só para esta aba
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}

/** Preferência salva + tema efetivo (resolvendo "system"). */
export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(readPref);
  const [dark, setDark] = useState(() => (pref === 'system' ? systemDark() : pref === 'dark'));

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => {
      const p = readPref();
      setPref(p);
      setDark(p === 'system' ? mq.matches : p === 'dark');
    };
    mq.addEventListener('change', sync);
    window.addEventListener(THEME_EVENT, sync);
    return () => {
      mq.removeEventListener('change', sync);
      window.removeEventListener(THEME_EVENT, sync);
    };
  }, []);

  return { pref, dark, setPref: setThemePref };
}

/**
 * Cores dos gráficos em hex (atributos SVG do Recharts não resolvem var()).
 * Paleta categórica validada (slots 1–3) e rampa sequencial azul.
 */
export function chartColors(dark: boolean) {
  return dark
    ? {
        series: ['#3987e5', '#d95926', '#199e70'],
        surface: '#1a1a19',
        grid: '#2c2c2a',
        axis: '#383835',
        muted: '#9a9890',
        ink: '#f0efec',
        ink2: '#c3c2b7',
        // escuro → claro no tema escuro: mais scans = mais luminoso
        ramp: ['#262624', '#104281', '#184f95', '#1c5cab', '#256abf', '#3987e5', '#6da7ec', '#9ec5f4'],
      }
    : {
        series: ['#2a78d6', '#eb6834', '#1baf7a'],
        surface: '#fcfcfb',
        grid: '#e1e0d9',
        axis: '#c3c2b7',
        muted: '#6f6d68',
        ink: '#0b0b0b',
        ink2: '#52514e',
        ramp: ['#f0efec', '#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'],
      };
}
