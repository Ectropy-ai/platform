const { NxWebpackPlugin } = require('@nx/webpack');
const { join, resolve } = require('path');
const { pathToFileURL } = require('url');
module.exports = {
  output: {
    path: join(__dirname, '../../dist/apps/mcp-server'),
    filename: 'main.js',
    // Critical: Use file:// URLs on Windows
    publicPath: process.platform === 'win32'
      ? pathToFileURL(join(__dirname, '../../dist/apps/mcp-server')).href
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
    {
      // Remove "type": "module" from generated package.json to use CommonJS
      apply: (compiler) => {
        compiler.hooks.afterEmit.tapAsync('FixPackageJson', (compilation, callback) => {
          const fs = require('fs');
          const pkgPath = join(__dirname, '../../dist/apps/mcp-server/package.json');
          if (fs.existsSync(pkgPath)) {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            delete pkg.type;  // Remove "type": "module" to use CommonJS
            fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
          }
          callback();
        });
      }
    }
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
    'ioredis',
    'pg',
    'express',
    'compression',
    'cors',
    'helmet',
    'express-rate-limit',
    'express-validator',
    'node-fetch',
    'openai',
    'prom-client',
    'loglevel',
    'pdf-parse',
    '@octokit/rest',
    '@octokit/graphql',
    '@qdrant/js-client-rest',
    // ROOT CAUSE #124: GraphQL runtime dependencies
    'graphql',
    'graphql-tag',  // Used for GraphQL query parsing
    // ROOT CAUSE #125: UUID dependency
    'uuid',  // Used for ID generation
  ],
  resolve: {
    extensions: ['.ts', '.js', '.mjs'],
    // Critical for Windows paths
    modules: [
      resolve(__dirname, 'node_modules'),
      resolve(__dirname, '../../node_modules')
    ],
    alias: {
      '@ectropy/shared/utils': resolve(__dirname, '../../libs/shared/utils/src/index.ts'),
      '@ectropy/shared': resolve(__dirname, '../../libs/shared/src/index.ts')
    }
  },
  // Suppress source-map-loader warnings from third-party packages that ship
  // source map references pointing to TypeScript source files not included in
  // the npm package. Root cause: graphql-subscriptions@3.0.0 dist/*.js files
  // reference ../src/*.ts but the src/ directory is not published.
  // Five Why: FIVE_WHY_BUILD_WARNINGS_LOCKFILE_SOURCEMAP_2026-03-04.json
  ignoreWarnings: [
    {
      module: /node_modules[\\/]graphql-subscriptions/,
      message: /Failed to parse source map/,
    },
  ],
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              transpileOnly: true,
              configFile: resolve(__dirname, 'tsconfig.app.json')
            }
          }
        ]
      }
    ]
  }
};
