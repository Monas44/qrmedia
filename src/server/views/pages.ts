// Páginas públicas mínimas (sem dependências) para links inexistentes, inativos ou expirados.

function page(status: number, title: string, message: string): Response {
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title}</title>
<style>
  :root { color-scheme: light dark; --bg: #f8fafc; --fg: #0f172a; --muted: #64748b; --card: #fff; --border: #e2e8f0; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0b1120; --fg: #e2e8f0; --muted: #94a3b8; --card: #111827; --border: #1f2937; } }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px;
         background: var(--bg); color: var(--fg); font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 420px; width: 100%; text-align: center; background: var(--card); border: 1px solid var(--border);
         border-radius: 16px; padding: 32px 24px; }
  .code { font-size: 14px; font-weight: 600; letter-spacing: .08em; color: var(--muted); }
  h1 { font-size: 22px; margin: 8px 0; }
  p { color: var(--muted); margin: 0; }
</style>
</head>
<body><main><div class="code">${status}</div><h1>${title}</h1><p>${message}</p></main></body>
</html>`;
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
}

export const notFoundPage = () =>
  page(404, 'Link não encontrado', 'Este QR code ou link não existe. Confira o endereço e tente novamente.');

export const inactivePage = () =>
  page(404, 'Link indisponível', 'Este link foi desativado pelo responsável.');

export const expiredPage = () =>
  page(410, 'Link expirado', 'Este QR code expirou e não está mais disponível.');
