import { describe, test, expect } from 'vitest';
import { existsSync } from 'fs';

/**
 * Platform Smoke Tests
 *
 * These are integration tests that verify build artifacts exist.
 * They require running `pnpm nx run-many --target=build` before execution.
 *
 * Skip these tests during unit test runs using: pnpm test --exclude="** /smoke.test.ts"
 *
 * P0 FIX (2026-01-04): Re-enabled smoke test suite
 * - Was completely disabled (describe.skip)
 * - Critical for CI/CD validation
 * - Tests verify build artifacts exist before deployment
 */
describe('Platform Smoke Tests', () => {
  test('MCP build exists', () => {
    expect(existsSync('dist/apps/mcp-server/main.js')).toBe(true);
  });

  test('API build exists', () => {
    expect(existsSync('dist/apps/api-gateway/main.js')).toBe(true);
  });

  test('Web build exists', () => {
    expect(existsSync('dist/apps/web-dashboard')).toBe(true);
  });

  test('Web dashboard has index.html', () => {
    expect(existsSync('dist/apps/web-dashboard/index.html')).toBe(true);
  });

  test('MCP server has package.json', () => {
    expect(existsSync('dist/apps/mcp-server/package.json')).toBe(true);
  });

  test('API gateway has package.json', () => {
    expect(existsSync('dist/apps/api-gateway/package.json')).toBe(true);
  });
});
