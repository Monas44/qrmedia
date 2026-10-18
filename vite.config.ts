import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// O painel é servido em /app/ pelo próprio servidor Node.
export default defineConfig({
  root: r('./src/app'),
  base: '/app/',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@shared': r('./src/shared') } },
  build: {
    outDir: r('./dist/client/app'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
  },
  server: {
    port: 5173,
    // `npm run dev` (Vite) + `npm run dev:server` (API na porta 3000)
    proxy: { '/api': 'http://localhost:3000' },
  },
});
