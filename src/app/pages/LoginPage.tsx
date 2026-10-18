import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ThemeButton } from '../components/Layout';
import { Alert, Button, Field, Icon, Input } from '../components/ui';
import { api, errorMessage } from '../lib/api';

export function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/auth/login', { password });
      onLogin();
      navigate(from && from !== '/login' ? from : '/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4">
      <div className="absolute top-3 right-3">
        <ThemeButton />
      </div>
      <form onSubmit={submit} className="w-full max-w-sm rounded-xl border border-line bg-surface p-6">
        <div className="mb-6 flex items-center gap-3">
          <span className="inline-flex size-10 items-center justify-center rounded-lg bg-accent text-on-accent">
            <Icon name="qr" />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-ink">QR Dinâmico</h1>
            <p className="text-sm text-ink-2">Acesso ao painel</p>
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <Field label="Senha de administrador" htmlFor="password">
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              autoFocus
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {error && <Alert>{error}</Alert>}
          <Button type="submit" variant="primary" disabled={busy || !password}>
            {busy ? 'Entrando…' : 'Entrar'}
          </Button>
        </div>
      </form>
    </div>
  );
}
