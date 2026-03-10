// Import base configuration from root
import baseConfig from '../../eslint.config.js';
import typescriptParser from '@typescript-eslint/parser';

export default [
  {
    ignores: ['.next/**/*', 'eslint.config.js'],
  },
  ...baseConfig,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      // Developer Portal specific rules
    },
  },
  {
    files: ['**/*.js', '**/*.jsx'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      // Developer Portal specific rules for JS files
    },
  },
];
