import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const caminho = (p) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: caminho('./client'),
  plugins: [react()],
  resolve: {
    alias: { '@shared': caminho('./shared') },
  },
  build: {
    outDir: caminho('./dist'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:3210' },
    fs: { allow: [caminho('.')] },
  },
});
