import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useTheme, type ThemePref } from '../lib/theme';
import { cx, Icon, type IconName } from './ui';

const THEME_NEXT: Record<ThemePref, ThemePref> = { system: 'light', light: 'dark', dark: 'system' };
const THEME_META: Record<ThemePref, { icon: IconName; label: string }> = {
  system: { icon: 'monitor', label: 'Tema: sistema' },
  light: { icon: 'sun', label: 'Tema: claro' },
  dark: { icon: 'moon', label: 'Tema: escuro' },
};

export function ThemeButton() {
  const { pref, setPref } = useTheme();
  const meta = THEME_META[pref];
  return (
    <button
      type="button"
      onClick={() => setPref(THEME_NEXT[pref])}
      title={meta.label}
      aria-label={`${meta.label}. Clique para alternar.`}
      className="inline-flex size-10 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2 hover:text-ink"
    >
      <Icon name={meta.icon} />
    </button>
  );
}

const navItem = ({ isActive }: { isActive: boolean }) =>
  cx(
    'inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors',
    isActive ? 'bg-surface-2 text-ink' : 'text-ink-2 hover:text-ink',
  );

export function Layout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const logout = async () => {
    await api.post('/auth/logout').catch(() => undefined);
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-[1000] border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4">
          <NavLink to="/" className="mr-2 flex items-center gap-2 font-semibold text-ink">
            <span className="inline-flex size-7 items-center justify-center rounded-md bg-accent text-on-accent">
              <Icon name="qr" className="size-4" />
            </span>
            <span className="hidden sm:inline">QR Dinâmico</span>
          </NavLink>
          <nav className="flex items-center gap-1" aria-label="Principal">
            <NavLink to="/" end className={navItem}>
              <Icon name="link" className="size-4" />
              Links
            </NavLink>
            <NavLink to="/analytics" className={navItem}>
              <Icon name="chart" className="size-4" />
              Analytics
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <ThemeButton />
            <button
              type="button"
              onClick={logout}
              title="Sair"
              aria-label="Sair"
              className="inline-flex size-10 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2 hover:text-ink"
            >
              <Icon name="logout" />
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back}
        <h1 className="truncate text-2xl font-semibold text-ink">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-ink-2">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
