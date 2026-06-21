import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/care/',
  build: {
    outDir: '../nouriva-landing/care',
    emptyOutDir: true,
  },
  server: { port: 5174, host: true },
});
