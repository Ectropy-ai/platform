import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

/**
 * Ectropy Employee Console - Vite Configuration
 *
 * Separate build configuration for the platform administration console.
 * Runs on port 3001 to avoid conflicts with web-dashboard (3000).
 *
 * Deployment: console.ectropy.ai (subdomain-based routing)
 *
 * Migration Note: This configuration will move to ectropy-business repo post-split.
 */
export default defineConfig({
  plugins: [react()],
  // Base path: root '/' since console is deployed to its own subdomain (console.ectropy.ai)
  base: process.env.VITE_BASE_PATH || '/',
  server: {
    port: 3001,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          mui: ['@mui/material', '@mui/icons-material'],
          query: ['@tanstack/react-query'],
        },
      },
    },
  },
  define: {
    'import.meta.env.VITE_APP_NAME': JSON.stringify('Ectropy Console'),
    'import.meta.env.VITE_APP_VERSION': JSON.stringify('0.1.0'),
  },
});
