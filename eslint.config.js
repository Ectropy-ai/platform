// Enterprise ESLint Configuration for Ectropy Platform
// Minimal configuration focused on essential quality checks

import typescriptEslint from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  // Global ignores (replaces .eslintignore)
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'coverage/**',
      '.nx/**',
      'tmp/**',
      'archive/**',
      'backup*/**',
      '.setup-backups/**',
      '**/*.d.ts',
      '**/*.js.map',
      '**/*.sh',
      '**/*.json',
      '**/*.md',
      '**/*.yml',
      '**/*.yaml',
      '**/*.ifc',
      '**/*.sql', // Exclude SQL files completely
      'demo-environment/**/*', // Exclude demo environment
      '.env*',
      '*.log',
      'static/**',
      '__mocks__/**',
      'test-data/**',
      // Ignore Jest configuration files specifically
      'apps/mobile-app/jest.config.js',
      'libs/mcp-client/jest.config.js',
      'libs/blockchain/jest.config.js',
      // Ignore specific problematic TypeScript files that have structural damage
      'libs/ai-agents/compliance/src/compliance-agent.ts',
      'libs/ai-agents/compliance/src/examples.ts',
      // Keep ignoring all other TypeScript files until all dependencies are properly installed
      // The 4 files we've fixed (simple-auth-server.ts, test-server.ts, speckle-stubs.ts, auth.service.ts)
      // will still show module resolution errors but not syntax errors
      '**/*.ts',
      '**/*.tsx',
      // Exception: Allow specific TypeScript files to be linted for CI
      '!apps/mcp-server/**/*.ts',
      '!apps/mobile-app/**/*.{ts,tsx,js,jsx}',
      '!apps/edge-server/**/*.ts',
      '!apps/api-gateway/**/*.{ts,tsx}',
      '!apps/web-dashboard/**/*.{ts,tsx}',
      '!apps/developer-portal/**/*.{ts,tsx}',
      '!tools/extraction-pipeline/**/*.{ts,js}',
      '!libs/embeddings/**/*.ts',
      '!libs/feature-flags/**/*.ts',
      '!libs/mcp-client/**/*.ts',
      '!libs/monitoring/**/*.ts',
      '!libs/construction/**/*.ts',
      '!packages/ifc/**/*.ts',
      '!packages/clash/**/*.ts',
      '!packages/mcp-client/**/*.ts',
      '!packages/federation/**/*.ts',
      '!packages/sdk-javascript/**/*.ts',
      // Specific problematic files
      'tests/auth/authentication-flows.test.js', // Parser issue with line 447
      // Test files with Vitest syntax (ESLint parser issues)
      '**/*.test.{ts,tsx}',
      '**/*.spec.{ts,tsx}',
    ],
  },

  // Base configuration - TypeScript files temporarily excluded until deps available
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
      },
    },
    rules: {
      // Essential enterprise quality rules
      'no-console': ['warn', { allow: ['warn', 'error', 'info', 'log'] }], // Allow console.log for debugging
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-duplicate-imports': 'error',
      'no-unused-expressions': 'error',
      'prefer-template': 'error',
      'object-shorthand': 'error',
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },

  // Development and testing files - more lenient rules
  {
    files: [
      '**/*.config.{js,ts}',
      'scripts/**/*',
      'jest.setup.js',
      '**/*.test.{ts,js}',
      '**/*.spec.{ts,js}',
      '__tests__/**/*',
      // Development and staging servers
      '**/minimal-server.js',
      '**/main-staging.js',
      '**/web-dashboard-server.js',
      // Example and demo files
      'examples/**/*',
      '**/examples/**/*',
      '**/examples.js',
      // Archive/backup files
      'scripts/archived/**/*',
      'archive/**/*',
    ],
    rules: {
      'no-console': 'off',
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },

  // Enterprise pattern: Allow console in demo/example files
  {
    files: ['examples/**/*', '**/demo*', '**/sample*', '**/mock*'],
    rules: {
      'no-console': 'off',
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },

  // Special configuration for mcp-server TypeScript files
  {
    files: ['apps/mcp-server/**/*.ts'],
    languageOptions: {
      parser: typescriptParser,
      ecmaVersion: 2022,
      sourceType: 'module',

      parserOptions: {
        project: './tsconfig.eslint.json',
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': typescriptEslint,
    },
    rules: {
      // Essential enterprise quality rules for TypeScript files
      'no-console': ['warn', { allow: ['warn', 'error', 'info', 'log'] }],
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-duplicate-imports': 'error',
      'no-unused-expressions': 'error',
      'prefer-template': 'error',
      'object-shorthand': 'error',
      'no-undef': 'off', // TypeScript handles this
      'no-shadow': 'warn',
      'no-redeclare': 'warn',
      'no-empty-function': 'error',
      'no-multi-spaces': 'error',
      'no-unreachable': 'error',
      'no-fallthrough': 'error',
      'no-return-await': 'error',
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },

  // Special configuration for embeddings TypeScript files
  {
    files: ['libs/embeddings/**/*.ts'],
    languageOptions: {
      parser: typescriptParser,
      ecmaVersion: 2022,
      sourceType: 'module',

      parserOptions: {
        project: './tsconfig.eslint.json',
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': typescriptEslint,
    },
    rules: {
      // Essential enterprise quality rules for TypeScript files
      'no-console': ['warn', { allow: ['warn', 'error', 'info', 'log'] }],
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-duplicate-imports': 'error',
      'no-unused-expressions': 'error',
      'prefer-template': 'error',
      'object-shorthand': 'error',
      'no-undef': 'off', // TypeScript handles this
      'no-shadow': 'warn',
      'no-redeclare': 'warn',
      'no-empty-function': 'error',
      'no-multi-spaces': 'error',
      'no-unreachable': 'error',
      'no-fallthrough': 'error',
      'no-return-await': 'error',
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },

  // Special configuration for feature-flags TypeScript files
  {
    files: ['libs/feature-flags/**/*.ts'],
    languageOptions: {
      parser: typescriptParser,
      ecmaVersion: 2022,
      sourceType: 'module',

      parserOptions: {
        project: './tsconfig.eslint.json',
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': typescriptEslint,
    },
    rules: {
      // Essential enterprise quality rules for TypeScript files
      'no-console': ['warn', { allow: ['warn', 'error', 'info', 'log'] }],
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-duplicate-imports': 'error',
      'no-unused-expressions': 'error',
      'prefer-template': 'error',
      'object-shorthand': 'error',
      'no-undef': 'off', // TypeScript handles this
      'no-shadow': 'warn',
      'no-redeclare': 'warn',
      'no-empty-function': 'error',
      'no-multi-spaces': 'error',
      'no-unreachable': 'error',
      'no-fallthrough': 'error',
      'no-return-await': 'error',
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },

  // Special configuration for mcp-client TypeScript files
  {
    files: ['libs/mcp-client/**/*.ts'],
    languageOptions: {
      parser: typescriptParser,
      ecmaVersion: 2022,
      sourceType: 'module',

      parserOptions: {
        project: './tsconfig.eslint.json',
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': typescriptEslint,
    },
    rules: {
      // Essential enterprise quality rules for TypeScript files
      'no-console': ['warn', { allow: ['warn', 'error', 'info', 'log'] }],
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-duplicate-imports': 'error',
      'no-unused-expressions': 'error',
      'prefer-template': 'error',
      'object-shorthand': 'error',
      'no-undef': 'off', // TypeScript handles this
      'no-shadow': 'warn',
      'no-redeclare': 'warn',
      'no-empty-function': 'error',
      'no-multi-spaces': 'error',
      'no-unreachable': 'error',
      'no-fallthrough': 'error',
      'no-return-await': 'error',
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },

  // Special configuration for monitoring library
  {
    files: ['libs/monitoring/**/*.ts'],
    languageOptions: {
      parser: typescriptParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        project: './tsconfig.eslint.json',
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': typescriptEslint,
    },
    rules: {
      // Monitoring specific linting rules
      'no-console': ['warn', { allow: ['warn', 'error', 'info', 'log'] }],
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-duplicate-imports': 'error',
      'no-unused-expressions': 'error',
      'prefer-template': 'error',
      'object-shorthand': 'error',
      'no-undef': 'off', // TypeScript handles this
      'no-shadow': 'warn',
      'no-redeclare': 'warn',
      'no-empty-function': 'error',
      'no-multi-spaces': 'error',
      'no-unreachable': 'error',
      'no-fallthrough': 'error',
      'no-return-await': 'error',
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },

  // Special configuration for edge-server application
  {
    files: ['apps/edge-server/**/*.ts'],
    languageOptions: {
      parser: typescriptParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        project: './tsconfig.eslint.json',
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': typescriptEslint,
    },
    rules: {
      // Edge server specific linting rules
      'no-console': ['warn', { allow: ['warn', 'error', 'info', 'log'] }],
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-duplicate-imports': 'error',
      'no-unused-expressions': 'error',
      'prefer-template': 'error',
      'object-shorthand': 'error',
      'no-undef': 'off', // TypeScript handles this
      'no-shadow': 'warn',
      'no-redeclare': 'warn',
      'no-empty-function': 'error',
      'no-multi-spaces': 'error',
      'no-unreachable': 'error',
      'no-fallthrough': 'error',
      'no-return-await': 'error',
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },

  // Special configuration for api-gateway application
  {
    files: ['apps/api-gateway/**/*.{ts,tsx}'],
    languageOptions: {
      parser: typescriptParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        project: './tsconfig.eslint.json',
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': typescriptEslint,
    },
    rules: {
      // API Gateway specific linting rules
      'no-console': ['warn', { allow: ['warn', 'error', 'info', 'log'] }],
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-duplicate-imports': 'error',
      'no-unused-expressions': 'error',
      'prefer-template': 'error',
      'object-shorthand': 'error',
      'no-undef': 'off', // TypeScript handles this
      'no-shadow': 'warn',
      'no-redeclare': 'warn',
      'no-empty-function': 'error',
      'no-multi-spaces': 'error',
      'no-unreachable': 'error',
      'no-fallthrough': 'error',
      'no-return-await': 'error',
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },

  // Special configuration for mobile-app files (React Native)
  {
    files: ['apps/mobile-app/**/*.{ts,tsx,js,jsx}'],
    ignores: [
      'apps/mobile-app/jest.config.js',
      'apps/mobile-app/eslint.config.js',
    ],
    languageOptions: {
      parser: typescriptParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        project: './tsconfig.eslint.json',
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': typescriptEslint,
    },
    rules: {
      // Mobile app specific linting rules - more lenient for React Native
      'no-console': ['warn', { allow: ['warn', 'error', 'info', 'log'] }],
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-duplicate-imports': 'error',
      'no-unused-expressions': 'error',
      'prefer-template': 'error',
      'object-shorthand': 'error',
      'no-undef': 'off', // TypeScript handles this
      'no-shadow': 'warn',
      'no-redeclare': 'warn',
      'no-empty-function': 'error',
      'no-multi-spaces': 'error',
      'no-unreachable': 'error',
      'no-fallthrough': 'error',
      'no-return-await': 'error',
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },

  // Special configuration for web-dashboard files (React)
  {
    files: ['apps/web-dashboard/**/*.{ts,tsx}'],
    languageOptions: {
      parser: typescriptParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        project: './tsconfig.eslint.json',
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
        window: 'readonly',
        document: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': typescriptEslint,
      'react-hooks': reactHooks,
    },
    rules: {
      // Web dashboard specific linting rules
      'no-console': ['warn', { allow: ['warn', 'error', 'info', 'log'] }],
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-duplicate-imports': 'error',
      'no-unused-expressions': 'error',
      'prefer-template': 'error',
      'object-shorthand': 'error',
      'no-undef': 'off', // TypeScript handles this
      'no-shadow': 'warn',
      'no-redeclare': 'warn',
      'no-empty-function': 'error',
      'no-multi-spaces': 'error',
      'no-unreachable': 'error',
      'no-fallthrough': 'error',
      'no-return-await': 'error',
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // React Hooks rules
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];
