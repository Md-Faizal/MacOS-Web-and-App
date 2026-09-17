import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  process.env.NODE_ENV = mode;

  return {
    root: 'frontend',
    base: '/',
    publicDir: 'public',
    plugins: [],
    server: {
      port: Number(env.VITE_PORT) || 5173,
      host: '0.0.0.0',
      cors: true,
      proxy: {
        '/api': {
          target: env.VITE_API_TARGET || 'http://localhost:3002',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, '/api')
        },
        // Proxy clean wallpaper storage hierarchy during development
        '/storage': {
          target: env.VITE_API_TARGET || 'http://localhost:3002',
          changeOrigin: true
        }
      },
      hmr: {
        protocol: 'ws',
        host: mode === 'production' ? '0.0.0.0' : 'localhost'
      }
    },
    build: {
      outDir: '../dist',
      emptyOutDir: true,
      sourcemap: mode !== 'production',
      minify: mode === 'production',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'frontend/index.html'),
          home: resolve(__dirname, 'frontend/home.html'),
          offline: resolve(__dirname, 'frontend/offline.html'),
          'customer-ledger': resolve(__dirname, 'frontend/customer-ledger.html'),
          'public-product': resolve(__dirname, 'frontend/public-product.html')
        }
      }
    }
  };
});
