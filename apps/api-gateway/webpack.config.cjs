const { NxWebpackPlugin } = require('@nx/webpack');
const webpack = require('webpack');
const { join, resolve } = require('path');
const { pathToFileURL } = require('url');

module.exports = {
  output: {
    path: join(__dirname, '../../dist/apps/api-gateway'),
    filename: 'main.js',
    // Critical: Use file:// URLs on Windows
    publicPath: process.platform === 'win32'
      ? pathToFileURL(join(__dirname, '../../dist/apps/api-gateway')).href
      : '/',
    // Removed library config - not needed for Node.js applications
    // This prevents CommonJS/ESM conflicts
  },
  plugins: [
    new NxWebpackPlugin({
      target: 'node',
      compiler: 'tsc',
      main: './src/main.ts',
      tsConfig: './tsconfig.app.json',
      optimization: process.env.NODE_ENV === 'production',
      outputHashing: process.env.NODE_ENV === 'production' ? 'all' : 'none',
      sourceMap: true,
      generatePackageJson: true,
    }),
    // ENTERPRISE FIX (2026-03-05): Prevent webpack code-splitting for Node.js server
    // ROOT CAUSE: await import() creates separate chunks (e.g., 20.js) that fail to load
    // at runtime in Docker containers. Static server bundles must be a single file.
    // Industry standard: Node.js servers should NEVER use code splitting.
    new webpack.optimize.LimitChunkCountPlugin({ maxChunks: 1 }),
  ],
  target: 'node',
  node: {
    __dirname: false,
    __filename: false
  },
  externalsPresets: {
    node: true  // Automatically externalize Node.js built-ins
  },
  externals: [
    // Native modules (require compilation) - must not be bundled
    'bcrypt',
    'sharp',
    'canvas',
    // NPM packages (avoid bundling large node_modules)
    'express',
    'express-rate-limit',
    'rate-limit-redis',
    'express-validator',
    'helmet',
    'compression',
    'cors',
    'ioredis',
    'pg',
    'node-fetch',
    'multer',
    'form-data',
    'passport',
    'passport-google-oauth20',
    'express-session',
    'connect-redis',
    'prom-client',
    // REMOVED: 'envalid' - Must be bundled for staging deployment
    'isomorphic-dompurify',
    '@octokit/rest',
    '@octokit/graphql',
    // ROOT CAUSE #124: Runtime dependencies for demo-scenarios
    'date-fns',  // Used by demo-scenarios generators
  ],
  resolve: {
    extensions: ['.ts', '.js', '.mjs'],
    modules: [
      resolve(__dirname, 'node_modules'),
      resolve(__dirname, '../../node_modules')
    ],
    alias: {
      // P0 FIX (2026-01-05): Add @ectropy/shared/config webpack alias
      // REASON: Missing alias causes webpack to fail resolving getEnvConfig, getCorsOrigins exports
      // ERROR: "export 'getEnvConfig' was not found in '@ectropy/shared/config'"
      // SOLUTION: Map to libs/shared/config/src (matches tsconfig.base.json path mapping)
      '@ectropy/shared/config': resolve(__dirname, '../../libs/shared/config/src'),
      '@ectropy/shared/integrations': resolve(__dirname, '../../libs/shared/integrations/src'),
      '@ectropy/shared': resolve(__dirname, '../../libs/shared/src'),
      '@ectropy/shared/utils': resolve(__dirname, '../../libs/shared/utils/src'),
      '@ectropy/shared/types': resolve(__dirname, '../../libs/shared/types/src'),
      // ENTERPRISE FIX (2026-01-24): Add demo-scenarios webpack alias
      // ROOT CAUSE #123: Module resolution failure during webpack bundling
      // Webpack must resolve to source directory (not dist) for proper bundling
      '@ectropy/demo-scenarios': resolve(__dirname, '../../libs/demo-scenarios/src'),
      // ROOT CAUSE #FWY-2026-03-05: Speckle routes import fails at build time
      // speckle.routes.enterprise.ts imports these packages — webpack needs aliases
      // to bundle them into the server bundle (tsconfig paths alone don't work for webpack)
      '@ectropy/speckle-integration': resolve(__dirname, '../../libs/speckle-integration/src'),
      '@ectropy/ifc-processing': resolve(__dirname, '../../libs/ifc-processing/src'),
      // ROOT CAUSE #137: Cross-app dynamic imports fail webpack resolution
      // Contract upload feature (PR #2311) imports mcp-server services
      // TypeScript path mappings work for type-checking but webpack needs aliases
      // ARCHITECTURAL NOTE: This bundles mcp-server code into api-gateway
      // TODO: Refactor to extract contract parsing into shared lib or call via HTTP
      '@ectropy/mcp-server/services': resolve(__dirname, '../../apps/mcp-server/src/services'),
    },
  }
};
