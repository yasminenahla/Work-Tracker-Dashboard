import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vercel builds this with `vite build` and serves ./dist as static output,
// while /api/** is deployed separately as serverless functions (see
// vercel.json). See README.md for local dev (`vercel dev` proxies /api).
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
  },
});
