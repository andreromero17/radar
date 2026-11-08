import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
    // Tudo que for /api vai para o Express em dev
    proxy: { '/api': 'http://localhost:3001' },
  },
});
