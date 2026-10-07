import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Separado do vite.config.ts de propósito: o teste não precisa do plugin PWA nem
// do proxy de /api, e carregá-los deixaria a suíte lenta e dependente da rede.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
});
