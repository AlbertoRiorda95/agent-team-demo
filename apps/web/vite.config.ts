import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const api = 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': api, '/health': api } },
  preview: { proxy: { '/api': api, '/health': api } },
  test: { environment: 'jsdom', exclude: ['e2e/**', 'node_modules/**', 'dist/**'] },
});
