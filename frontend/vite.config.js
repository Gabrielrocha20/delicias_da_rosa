import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Em desenvolvimento o React chama /api e o Vite encaminha para o Django (npm run dev).
    proxy: { '/api': 'http://127.0.0.1:3333' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    restoreMocks: true,
  },
  build: {
    sourcemap: true,
  },
});
