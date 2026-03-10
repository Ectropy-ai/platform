import { describe, it, expect } from 'vitest';

/**
 * Test for enhanced secret validation with OpenAI API key support
 */

import { SecretValidator } from '../src/validation.js';

describe('Enhanced Secret Validation - OpenAI Integration', () => {
  const createTestConfig = (
    overrides: Partial<{
      key: string;
      environment: string;
      classification: 'critical' | 'high' | 'medium';
    }> = {}
  ) => ({
    key: 'TEST_SECRET',
    environment: 'development',
    classification: 'high' as const,
    ...overrides,
  });

  describe('OpenAI API Key Validation', () => {
    it('should validate correct OpenAI API key format', () => {
      const validKey = 'sk-' + 'a'.repeat(48);
      const config = createTestConfig({
        key: 'OPENAI_API_KEY',
        classification: 'critical',
      });

      const results = SecretValidator.validateSecret(validKey, config);

      // Should pass format validation
      const formatResult = results.find((r) => r.passed);
      expect(formatResult).toBeDefined();
    });

    it('should reject OpenAI API key without sk- prefix', () => {
      const invalidKey = 'invalid-key-format';
      const config = createTestConfig({
        key: 'OPENAI_API_KEY',
        classification: 'critical',
      });

      const results = SecretValidator.validateSecret(invalidKey, config);

      // Should fail format validation
      const formatFailure = results.find(
        (r) => !r.passed && r.message?.includes('must start with "sk-"')
      );
      expect(formatFailure).toBeDefined();
      expect(formatFailure?.severity).toBe('error');
    });

    it('should reject OpenAI API key with invalid length', () => {
      const shortKey = 'sk-tooshort';
      const config = createTestConfig({
        key: 'OPENAI_API_KEY',
        classification: 'critical',
      });

      const results = SecretValidator.validateSecret(shortKey, config);

      // Should fail length validation
      const lengthFailure = results.find(
        (r) => !r.passed && r.message?.includes('invalid length')
      );
      expect(lengthFailure).toBeDefined();
      expect(lengthFailure?.severity).toBe('error');
    });

    it('should reject OpenAI API key with invalid format', () => {
      const invalidFormatKey =
        'sk-invalid!@#$%^&*()_+{}|:"<>?[]\\;\',./' + 'a'.repeat(20);
      const config = createTestConfig({
        key: 'OPENAI_API_KEY',
        classification: 'critical',
      });

      const results = SecretValidator.validateSecret(invalidFormatKey, config);

      // Should fail format validation
      const formatFailure = results.find(
        (r) => !r.passed && r.message?.includes('format is invalid')
      );
      expect(formatFailure).toBeDefined();
      expect(formatFailure?.severity).toBe('error');
    });
  });

  describe('Ectropy Platform Secret Validation', () => {
    it('should identify missing critical secrets', () => {
      const secrets = {
        JWT_SECRET: 'some-jwt-secret',
        // Missing OPENAI_API_KEY
      };

      const results = SecretValidator.validateEctropySecrets(secrets);

      const missingOpenAI = results.find(
        (r) =>
          !r.passed &&
          r.message?.includes('OPENAI_API_KEY') &&
          r.message?.includes('missing')
      );
      expect(missingOpenAI).toBeDefined();
      expect(missingOpenAI?.severity).toBe('error');
    });

    it('should validate all critical secrets are present', () => {
      const secrets = {
        OPENAI_API_KEY: 'sk-' + 'abcdef0123456789'.repeat(3), // Realistic OpenAI key
        JWT_SECRET:
          '3a7f8b2c9d1e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a', // Hex with variety
        JWT_REFRESH_SECRET:
          '9f8e7d6c5b4a3921fedcba0987654321abcdef0123456789fedcba9876543210', // Hex with variety
        ENCRYPTION_KEY: 'aB3$xY9!mN2@qW8#pL5^zK7&', // High entropy key
      };

      const results = SecretValidator.validateEctropySecrets(secrets);

      // Should not have failures for missing secrets (all critical secrets provided)
      const missingSecrets = results.filter(
        (r) => !r.passed && r.message?.includes('is missing')
      );
      expect(missingSecrets.length).toBe(0);
    });

    it('should warn about missing optional secrets', () => {
      const secrets = {
        OPENAI_API_KEY: 'sk-' + 'a'.repeat(48),
        JWT_SECRET: 'a'.repeat(64),
        JWT_REFRESH_SECRET: 'b'.repeat(64),
        ENCRYPTION_KEY: 'c'.repeat(32),
        // Missing optional DATABASE_URL, REDIS_URL, etc.
      };

      const results = SecretValidator.validateEctropySecrets(secrets);

      const warnings = results.filter((r) => r.severity === 'warning');
      expect(warnings.length).toBeGreaterThan(0);

      const databaseWarning = warnings.find((w) =>
        w.message?.includes('DATABASE_URL')
      );
      expect(databaseWarning).toBeDefined();
    });
  });

  describe('OpenAI API Connection Test', () => {
    it('should reject invalid API key format for connection test', async () => {
      const result =
        await SecretValidator.validateOpenAIConnection('invalid-key');

      expect(result.passed).toBe(false);
      expect(result.message).toContain('Invalid OpenAI API key format');
      expect(result.severity).toBe('error');
    });

    it('should handle missing API key', async () => {
      const result = await SecretValidator.validateOpenAIConnection('');

      expect(result.passed).toBe(false);
      expect(result.message).toContain('Invalid OpenAI API key format');
      expect(result.severity).toBe('error');
    });

    // Note: We can't test actual API connectivity in unit tests
    // That would be handled in integration tests or CI
  });

  describe('Enhanced JWT Validation', () => {
    it('should validate JWT secret format', () => {
      const hexSecret = 'a'.repeat(64);
      const config = createTestConfig({ key: 'JWT_SECRET' });

      const results = SecretValidator.validateSecret(hexSecret, config);

      // Should pass format validation for hex
      const formatCheck = results.find((r) =>
        r.message?.includes('JWT secret')
      );
      expect(formatCheck?.passed || !formatCheck).toBeTruthy();
    });

    it('should warn about invalid JWT secret format', () => {
      const invalidSecret = 'not-hex-or-base64!@#$';
      const config = createTestConfig({ key: 'JWT_SECRET' });

      const results = SecretValidator.validateSecret(invalidSecret, config);

      const formatFailure = results.find(
        (r) => !r.passed && r.message?.includes('JWT secret')
      );
      expect(formatFailure?.severity).toBe('warning');
    });
  });
});
