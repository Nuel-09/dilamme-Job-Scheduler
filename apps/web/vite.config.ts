import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '../../', '');
  const apiPort = env.API_PORT ?? '3200';

  return {
    plugins: [react(), tailwindcss()],
    envDir: '../../',
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: `http://localhost:${apiPort}`,
          changeOrigin: true,
        },
        '/docs': {
          target: `http://localhost:${apiPort}`,
          changeOrigin: true,
        },
        '/health': {
          target: `http://localhost:${apiPort}`,
          changeOrigin: true,
        },
      },
    },
  };
});
