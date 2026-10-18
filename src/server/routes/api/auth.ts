import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../env';
import { ok, readJson } from '../../lib/http';
import { login, logout, requireAuth } from '../../services/auth-service';

const loginSchema = z.object({ password: z.string().min(1, 'Informe a senha.').max(512) });

export const authRoutes = new Hono<AppEnv>()
  .post('/login', async (c) => {
    const { password } = loginSchema.parse(await readJson(c));
    await login(c, password);
    return ok(c, { authenticated: true });
  })
  .post('/logout', (c) => {
    logout(c);
    return ok(c, { authenticated: false });
  })
  .get('/me', requireAuth, (c) => ok(c, { authenticated: true, method: c.get('authMethod') }));
