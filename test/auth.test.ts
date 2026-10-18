import { describe, expect, it } from 'vitest';
import type { ApiFailure } from '../src/shared/types';
import { call, env, json } from './helpers';

const login = (password: string, ip: string) =>
  call('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Real-IP': ip },
    body: JSON.stringify({ password }),
  });

const sessionCookie = (res: Response) => res.headers.get('Set-Cookie')?.split(';')[0] ?? '';

describe('autenticação da API', () => {
  it('rejeita requisições sem sessão com 401 e JSON padronizado', async () => {
    const res = await call('/api/links');
    expect(res.status).toBe(401);
    const body = (await res.json()) as ApiFailure;
    expect(body).toEqual({ ok: false, error: { code: 'unauthorized', message: expect.any(String) } });
  });

  it('rejeita senha incorreta', async () => {
    const res = await login('errada', '192.0.2.10');
    expect(res.status).toBe(401);
    expect(res.headers.get('Set-Cookie')).toBeNull();
  });

  it('faz login com a senha correta e emite cookie HttpOnly que autentica a API', async () => {
    const res = await login(env.ADMIN_PASSWORD, '192.0.2.11');
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('Set-Cookie')!;
    expect(setCookie).toContain('qr_session=');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
    expect(setCookie).toContain('Secure');

    const me = await call('/api/auth/me', { headers: { Cookie: sessionCookie(res) } });
    expect(me.status).toBe(200);
    expect(await json(me)).toEqual({ ok: true, data: { authenticated: true, method: 'session' } });

    const links = await call('/api/links', { headers: { Cookie: sessionCookie(res) } });
    expect(links.status).toBe(200);
  });

  it('rejeita cookie de sessão adulterado', async () => {
    const res = await login(env.ADMIN_PASSWORD, '192.0.2.12');
    const tampered = `${sessionCookie(res).slice(0, -3)}abc`;
    const me = await call('/api/auth/me', { headers: { Cookie: tampered } });
    expect(me.status).toBe(401);
  });

  it('aplica rate limit após 5 tentativas erradas', async () => {
    const ip = '192.0.2.13';
    for (let i = 0; i < 5; i++) expect((await login('errada', ip)).status).toBe(401);

    const blocked = await login(env.ADMIN_PASSWORD, ip); // nem a senha certa passa
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThan(0);

    // Outro IP não é afetado.
    expect((await login(env.ADMIN_PASSWORD, '192.0.2.14')).status).toBe(200);
  });

  it('aceita o API_TOKEN via Bearer e rejeita token inválido', async () => {
    const good = await call('/api/auth/me', { headers: { Authorization: `Bearer ${env.API_TOKEN}` } });
    expect(good.status).toBe(200);
    const bad = await call('/api/links', { headers: { Authorization: 'Bearer token-errado-mas-longo' } });
    expect(bad.status).toBe(401);
  });

  it('bloqueia escrita vinda de outra origem (CSRF)', async () => {
    const res = await call('/api/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://site-malicioso.com', Authorization: `Bearer ${env.API_TOKEN}` },
      body: JSON.stringify({ destination_url: 'https://exemplo.com/' }),
    });
    expect(res.status).toBe(403);
  });

  it('logout remove o cookie', async () => {
    const res = await call('/api/auth/logout', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(res.headers.get('Set-Cookie')).toContain('Max-Age=0');
  });
});
