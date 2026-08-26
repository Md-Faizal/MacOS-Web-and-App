import { defineConfig, loadEnv } from 'vite';
import { cpSync, rmSync } from 'fs';
import { join, resolve } from 'path';

// Custom plugin to copy frontend source folder and clean up dist after build
const postBuildPlugin = {
  name: 'post-build',
  writeBundle: async () => {
    const cwd = process.cwd();
    const frontendPath = join(cwd, 'frontend');
    const backendPath = join(cwd, 'backend');
    const scriptsPyPath = join(cwd, 'scripts_py');
    const distFrontendPath = join(cwd, 'dist', 'frontend');
    const distBackendPath = join(cwd, 'dist', 'backend');
    const distScriptsPyPath = join(cwd, 'dist', 'scripts_py');
    const dbPath = join(cwd, 'dist', 'database');
    
    // Copy necessary folders to dist
    try {
      cpSync(backendPath, distBackendPath, { recursive: true, force: true });
      cpSync(scriptsPyPath, distScriptsPyPath, { recursive: true, force: true });
      console.log('✓ Copied backend/ and scripts_py/ to dist/');
      
      // Copy root files needed for production
      const filesToCopy = ['server-prod.js', 'ecosystem.config.js', 'package.json', 'package-lock.json', '.env.production', 'macos-nginx.conf'];
      filesToCopy.forEach(file => {
        const src = join(cwd, file);
        const dest = join(cwd, 'dist', file);
        if (require('fs').existsSync(src)) {
          cpSync(src, dest, { force: true });
        }
      });
      console.log('✓ Copied production config files to dist/');
    } catch (e) {
      console.error('Error copying frontend folder:', e.message);
    }
    
    // Remove database folder if it accidentally got into dist
    try {
      rmSync(dbPath, { recursive: true, force: true });
      console.log('✓ Removed dist/database/');
    } catch (e) {
      // Ignore
    }
  }
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  process.env.NODE_ENV = mode;

  return {
    root: 'frontend',
    base: '/',
    publicDir: 'public', // Small UI assets (images/icons) moved here
    plugins: [postBuildPlugin],
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
        // Proxy large wallpapers from root storage during development
        '/assets/Wallpaper': {
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
