const { NxWebpackPlugin } = require('@nx/webpack');
const webpack = require('webpack');
const path = require('path');

module.exports = (config, { configuration: _configuration }) => {
  // Base configuration
  config.plugins = config.plugins || [];
  config.plugins.push(
    new NxWebpackPlugin({
      target: 'web',
      compiler: 'babel',
      main: './src/main.tsx',
      tsConfig: './tsconfig.app.json',
      generatePackageJson: false,
    }),
  );

  // ENTERPRISE FIX (2025-12-17): ROOT CAUSE #56 - DefinePlugin bracket notation support
  // Problem: DefinePlugin with 'process.env': JSON.stringify({...}) pattern only replaces
  //          the exact string 'process.env', leaving bracket notation broken
  //          Example: process.env['KEY'] becomes {NODE_ENV:"production"}['KEY'] = undefined
  // Impact: Environment variables not replaced during build, resulting in empty values at runtime
  // Solution: Define each key individually for both dot notation AND bracket notation
  // Pattern: process.env.KEY + process.env['KEY'] + process.env["KEY"] → all replaced with literal values

  // Explicitly define all REACT_APP_* variables used by the application
  // Environment variables MUST be provided via Docker build args (see docker-compose.*.yml)
  // Defaults here are fallbacks for development builds only
  const reactAppEnv = {
    NODE_ENV: process.env.NODE_ENV || 'production',
    REACT_APP_API_URL: process.env.REACT_APP_API_URL || '',
    REACT_APP_LOG_LEVEL: process.env.REACT_APP_LOG_LEVEL || 'info',
    REACT_APP_ENABLE_SPECKLE: process.env.REACT_APP_ENABLE_SPECKLE || 'false',
    REACT_APP_ENABLE_WEBSOCKETS: process.env.REACT_APP_ENABLE_WEBSOCKETS || 'false',
    REACT_APP_RETRY_ATTEMPTS: process.env.REACT_APP_RETRY_ATTEMPTS || '3',
    REACT_APP_TIMEOUT_MS: process.env.REACT_APP_TIMEOUT_MS || '10000',
    // PHASE 2 (2025-12-18): ROOT CAUSE #58 - Speckle BIM Viewer Demo Content
    // Environment variables for demo IFC model (will be populated in Phase 5)
    REACT_APP_DEMO_STREAM_ID: process.env.REACT_APP_DEMO_STREAM_ID || '',
    REACT_APP_DEMO_OBJECT_ID: process.env.REACT_APP_DEMO_OBJECT_ID || '',
  };

  // Debug output for build-time verification
  console.log('=== WEBPACK DefinePlugin Configuration ===');
  console.log('Environment variables captured for DefinePlugin:');
  Object.entries(reactAppEnv).forEach(([key, value]) => {
    console.log(`  ${key}: ${value || '[EMPTY]'}`);
  });

  // Create DefinePlugin configuration supporting BOTH dot and bracket notation
  // This ensures all access patterns are replaced with literal values at compile time
  const definePluginConfig = {};
  Object.entries(reactAppEnv).forEach(([key, value]) => {
    // Dot notation: process.env.REACT_APP_API_URL
    definePluginConfig[`process.env.${key}`] = JSON.stringify(value);
    // Bracket notation with single quotes: process.env['REACT_APP_API_URL']
    definePluginConfig[`process.env['${key}']`] = JSON.stringify(value);
    // Bracket notation with double quotes: process.env["REACT_APP_API_URL"]
    definePluginConfig[`process.env["${key}"]`] = JSON.stringify(value);
  });

  const patternCount = Object.keys(definePluginConfig).length;
  const varCount = Object.keys(reactAppEnv).length;
  console.log(`=== DefinePlugin configured: ${varCount} variables × 3 notation patterns = ${patternCount} replacements ===`);

  config.plugins.push(
    new webpack.DefinePlugin(definePluginConfig)
  );

  // CI-specific optimizations
  if (process.env.CI === 'true') {
    // Disable source maps in CI for faster builds
    config.devtool = false;

    // Optimize for CI startup speed
    config.optimization = {
      ...config.optimization,
      removeAvailableModules: false,
      removeEmptyChunks: false,
      splitChunks: false, // Disable chunk splitting for faster CI startup
    };

    // Reduce bundle analysis overhead
    config.stats = 'errors-only';

    // Optimize dev server for CI
    config.devServer = {
      ...config.devServer,
      hot: false,
      liveReload: false,
      compress: false,
      // Reduce startup time by disabling unnecessary features
      client: {
        logging: 'error',
        overlay: false,
      },
    };
  }

  // Resolve aliases for better module resolution
  config.resolve = {
    ...config.resolve,
    alias: {
      ...(config.resolve?.alias || {}),
      '@': path.resolve(__dirname, 'src'),
      '@components': path.resolve(__dirname, 'src/components'),
      '@pages': path.resolve(__dirname, 'src/pages'),
      '@services': path.resolve(__dirname, 'src/services'),
      '@types': path.resolve(__dirname, 'src/types'),
      // FIX (2026-03-19): Force @speckle/viewer to resolve from node_modules.
      // Without this, webpack picks up src/__mocks__/@speckle/viewer.ts (a Jest
      // stub with an empty Viewer) instead of the real package.
      '@speckle/viewer': path.resolve(__dirname, '../../node_modules/@speckle/viewer'),
      '@speckle/objectloader': path.resolve(__dirname, '../../node_modules/@speckle/objectloader'),
      // Enterprise browser-safe utilities (exclude server-only winston/async_hooks)
      '@ectropy/shared/utils/browser': path.resolve(__dirname, '../../libs/shared/utils/src/browser.ts'),
    },
  };

  return config;
};
