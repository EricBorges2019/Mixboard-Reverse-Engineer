import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const apiPort = process.env.API_PORT ?? '8787';

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': `http://localhost:${apiPort}` } },
  test: { environment: 'node', globals: true },
});
