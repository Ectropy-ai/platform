/**
 * =============================================================================
 * VITE CONFIGURATION - ENTERPRISE WEB DASHBOARD
 * =============================================================================
 *
 * PURPOSE: Modern build tooling for React application
 * MIGRATION: From react-scripts (webpack) to Vite for performance and DX
 * FEATURES:
 * - Fast HMR (Hot Module Replacement)
 * - Optimized production builds
 * - TypeScript path resolution
 * - SVG as React components
 * - Environment variable handling
 *
 * ENTERPRISE BEST PRACTICES:
 * - Explicit configuration over implicit defaults
 * - Clear documentation for each setting
 * - Production-ready optimization
 * - Security headers and CSP
 */

import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import svgr from 'vite-plugin-svgr';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load environment variables based on mode (development, production, test)
  const env = loadEnv(mode, process.cwd(), '');

  return {
    /**
     * PLUGINS CONFIGURATION
     */
    plugins: [
      // React Fast Refresh and JSX transformation
      react({
        // Enable automatic JSX runtime (no need to import React)
        jsxRuntime: 'automatic',
        // Fast Refresh for better DX
        fastRefresh: true,
        // Include .tsx files
        include: '**/*.{jsx,tsx}',
      }),

      // TypeScript path resolution from tsconfig.json
      tsconfigPaths({
        root: '../../', // Root of monorepo
      }),

      // SVG as React components
      svgr({
        // SVG imports as React components
        svgrOptions: {
          icon: true,
          // Remove unnecessary attributes
          svgoConfig: {
            plugins: [
              {
                name: 'removeViewBox',
                active: false,
              },
            ],
          },
        },
      }),

      // ENTERPRISE SECURITY: Phase 1 Priority 3 - Sentry Integration (2025-11-30)
      // Sentry source map upload for production error tracking
      // Only runs in production builds with SENTRY_AUTH_TOKEN set
      ...(mode === 'production' && process.env.SENTRY_AUTH_TOKEN
        ? [
            sentryVitePlugin({
              org: process.env.SENTRY_ORG || 'ectropy',
              project: process.env.SENTRY_PROJECT || 'web-dashboard',
              authToken: process.env.SENTRY_AUTH_TOKEN,
              // Upload source maps to Sentry
              sourcemaps: {
                assets: './dist/apps/web-dashboard/assets/**',
                ignore: ['node_modules'],
              },
              // Release configuration
              release: {
                name: process.env.REACT_APP_VERSION || 'unknown',
                // Automatically set release in Sentry
                setCommits: {
                  auto: true,
                },
              },
              // Disable telemetry
              telemetry: false,
            }),
          ]
        : []),
    ],

    /**
     * DEVELOPMENT SERVER CONFIGURATION
     */
    server: {
      // Port configuration
      port: parseInt(env.PORT || '3000'),
      // Strict port - fail if port is already in use
      strictPort: false,
      // Host configuration
      host: env.HOST || 'localhost',
      // Open browser automatically
      open: false,
      // CORS configuration for API proxy
      cors: true,
      // HMR configuration
      hmr: {
        overlay: true, // Show errors as overlay
      },
      // Proxy API requests to backend
      proxy: {
        '/api': {
          target: env.REACT_APP_API_URL || 'http://localhost:4000',
          changeOrigin: true,
          secure: false,
        },
        '/ws': {
          target: env.REACT_APP_WEBSOCKET_URL || 'ws://localhost:4000',
          ws: true,
        },
      },
    },

    /**
     * BUILD CONFIGURATION
     */
    build: {
      // Output directory
      outDir: '../../dist/apps/web-dashboard',
      // ENTERPRISE SECURITY: Phase 1 Priority 3 - Sentry Integration (2025-11-30)
      // Generate sourcemaps for production error tracking
      // Sourcemaps are uploaded to Sentry via sentryVitePlugin, then can be deleted
      // Set to 'hidden' in production to generate .map files without source mapping URL in JS
      sourcemap: mode === 'production' ? 'hidden' : true,
      // Minification
      minify: mode === 'production' ? 'esbuild' : false,
      // Target browsers
      target: 'es2015',
      // Chunk size warning limit
      chunkSizeWarningLimit: 1000,
      // Rollup options
      rollupOptions: {
        output: {
          // Manual chunk splitting for better caching
          manualChunks: {
            // Vendor chunks
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-mui': [
              '@mui/material',
              '@mui/icons-material',
              '@mui/system',
              '@emotion/react',
              '@emotion/styled',
            ],
            'vendor-three': ['three', '@react-three/fiber', '@react-three/drei'],
            'vendor-charts': ['@mui/x-charts', '@mui/x-data-grid', 'recharts'],
            'vendor-speckle': ['@speckle/viewer', '@speckle/objectloader'],
          },
          // Asset file naming
          assetFileNames: (assetInfo) => {
            const info = assetInfo.name.split('.');
            const ext = info[info.length - 1];
            if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(ext)) {
              return `assets/images/[name]-[hash][extname]`;
            } else if (/woff|woff2/.test(ext)) {
              return `assets/fonts/[name]-[hash][extname]`;
            }
            return `assets/[name]-[hash][extname]`;
          },
          // Chunk file naming
          chunkFileNames: 'assets/js/[name]-[hash].js',
          // Entry file naming
          entryFileNames: 'assets/js/[name]-[hash].js',
        },
      },
      // Clear output dir before build
      emptyOutDir: true,
    },

    /**
     * ENVIRONMENT VARIABLES
     * Vite only exposes variables prefixed with VITE_
     * We define them here to maintain react-scripts compatibility
     */
    define: {
      // Expose process.env for compatibility with react-scripts
      'process.env.REACT_APP_API_URL': JSON.stringify(
        env.REACT_APP_API_URL || 'http://localhost:4000'
      ),
      'process.env.REACT_APP_ENVIRONMENT': JSON.stringify(
        env.REACT_APP_ENVIRONMENT || mode
      ),
      'process.env.REACT_APP_API_VERSION': JSON.stringify(
        env.REACT_APP_API_VERSION || 'v1'
      ),
      'process.env.REACT_APP_API_TIMEOUT': JSON.stringify(
        env.REACT_APP_API_TIMEOUT || '10000'
      ),
      'process.env.REACT_APP_ENABLE_ANALYTICS': JSON.stringify(
        env.REACT_APP_ENABLE_ANALYTICS || 'false'
      ),
      'process.env.REACT_APP_WEBSOCKET_URL': JSON.stringify(
        env.REACT_APP_WEBSOCKET_URL || 'ws://localhost:4000'
      ),
      'process.env.REACT_APP_SPECKLE_SERVER_URL': JSON.stringify(
        env.REACT_APP_SPECKLE_SERVER_URL || 'http://localhost:3001'
      ),
      'process.env.REACT_APP_MAX_FILE_SIZE': JSON.stringify(
        env.REACT_APP_MAX_FILE_SIZE || '10485760'
      ),
      'process.env.REACT_APP_SUPPORTED_FILE_TYPES': JSON.stringify(
        env.REACT_APP_SUPPORTED_FILE_TYPES || '.ifc,.dwg,.rvt'
      ),
      'process.env.REACT_APP_CACHE_DURATION': JSON.stringify(
        env.REACT_APP_CACHE_DURATION || '300000'
      ),
      // ENTERPRISE SECURITY: Phase 1 Priority 3 - Sentry Configuration (2025-11-30)
      'process.env.REACT_APP_SENTRY_DSN': JSON.stringify(
        env.REACT_APP_SENTRY_DSN || ''
      ),
      'process.env.REACT_APP_VERSION': JSON.stringify(
        env.REACT_APP_VERSION || env.npm_package_version || 'unknown'
      ),
      // Node environment
      'process.env.NODE_ENV': JSON.stringify(mode),
    },

    /**
     * RESOLUTION CONFIGURATION
     */
    resolve: {
      // Path aliases
      alias: {
        '@': resolve(__dirname, './src'),
        '@components': resolve(__dirname, './src/components'),
        '@pages': resolve(__dirname, './src/pages'),
        '@services': resolve(__dirname, './src/services'),
        '@hooks': resolve(__dirname, './src/hooks'),
        '@utils': resolve(__dirname, './src/utils'),
        '@assets': resolve(__dirname, './src/assets'),
        '@types': resolve(__dirname, './src/types'),
      },
      // Extensions to resolve
      extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json'],
    },

    /**
     * OPTIMIZATION CONFIGURATION
     */
    optimizeDeps: {
      // Pre-bundle dependencies for faster cold starts
      include: [
        'react',
        'react-dom',
        'react-router-dom',
        '@mui/material',
        '@mui/icons-material',
        '@emotion/react',
        '@emotion/styled',
      ],
      // Exclude large dependencies from pre-bundling
      exclude: ['three', '@speckle/viewer'],
    },

    /**
     * CSS CONFIGURATION
     */
    css: {
      // CSS modules configuration
      modules: {
        localsConvention: 'camelCase',
      },
      // PostCSS configuration
      postcss: {
        plugins: [],
      },
      // Preprocessor options
      preprocessorOptions: {
        scss: {
          additionalData: `@import "./src/styles/variables.scss";`,
        },
      },
      devSourcemap: true,
    },

    /**
     * PREVIEW SERVER (production build preview)
     */
    preview: {
      port: parseInt(env.PORT || '3000'),
      strictPort: false,
      open: false,
    },

    /**
     * LOGGING
     */
    logLevel: mode === 'production' ? 'info' : 'warn',

    /**
     * PERFORMANCE
     */
    esbuild: {
      // Remove console.log in production
      drop: mode === 'production' ? ['console', 'debugger'] : [],
      // Target ES2020 for better performance
      target: 'es2020',
    },
  };
});
