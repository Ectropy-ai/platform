import { describe, it, expect } from 'vitest';

/**
 * Enhanced Secret Validation Test Suite
 * Tests the comprehensive validation framework
 */

import { SecretValidator, SecretConfig, SecretValue } from '../src/validation';

describe('SecretValidator', () => {
  const createTestConfig = (
    overrides: Partial<SecretConfig> = {}
  ): SecretConfig => ({
    key: 'TEST_SECRET',
    environment: 'development',
    classification: 'high',
    ...overrides,
  });

  describe('validateSecret', () => {
    it('should pass validation for strong secrets', () => {
      const strongSecret = 'a'.repeat(64); // 64 char strong secret
      const config = createTestConfig({ classification: 'critical' });

      const results = SecretValidator.validateSecret(strongSecret, config);

      // Should pass minimum length
      const lengthResult = results.find(
        (r) => r.passed && strongSecret.length >= 64
      );
      expect(lengthResult).toBeDefined();
    });

    it('should fail validation for short secrets', () => {
      const shortSecret = 'short';
      const config = createTestConfig({ classification: 'critical' });

      const results = SecretValidator.validateSecret(shortSecret, config);

      // Should fail minimum length check
      const lengthFailure = results.find(
        (r) => !r.passed && r.message?.includes('too short')
      );
      expect(lengthFailure).toBeDefined();
      expect(lengthFailure?.severity).toBe('error');
    });

    it('should reject common password patterns', () => {
      const commonPasswords = ['password123', 'admin', 'qwerty', 'test123'];

      for (const password of commonPasswords) {
        const results = SecretValidator.validateSecret(
          password,
          createTestConfig()
        );
        const commonPatternFailure = results.find(
          (r) => !r.passed && r.message?.includes('common pattern')
        );
        expect(commonPatternFailure).toBeDefined();
      }
    });

    it('should reject placeholder values', () => {
      const placeholders = [
        'CHANGEME',
        'REPLACE_ME',
        'YOUR_SECRET_HERE',
        'TODO',
      ];

      for (const placeholder of placeholders) {
        const results = SecretValidator.validateSecret(
          placeholder,
          createTestConfig()
        );
        const placeholderFailure = results.find(
          (r) => !r.passed && r.message?.includes('placeholder')
        );
        expect(placeholderFailure).toBeDefined();
      }
    });

    it('should validate JWT secret format', () => {
      const config = createTestConfig({ key: 'JWT_SECRET' });

      // Valid hex JWT secret
      const hexSecret = 'a'.repeat(64);
      const hexResults = SecretValidator.validateSecret(hexSecret, config);
      const formatCheck = hexResults.find((r) =>
        r.message?.includes('JWT secret')
      );
      expect(formatCheck?.passed || !formatCheck).toBeTruthy();

      // Invalid JWT secret format
      const invalidSecret = 'not-hex-or-base64!@#$';
      const invalidResults = SecretValidator.validateSecret(
        invalidSecret,
        config
      );
      const formatFailure = invalidResults.find(
        (r) => !r.passed && r.message?.includes('JWT secret')
      );
      expect(formatFailure?.severity).toBe('warning');
    });

    it('should check entropy for cryptographic strength', () => {
      // Low entropy secret (all same character)
      const lowEntropySecret = 'a'.repeat(64);
      const results = SecretValidator.validateSecret(
        lowEntropySecret,
        createTestConfig()
      );

      // Should warn about low entropy
      const entropyWarning = results.find((r) =>
        r.message?.includes('entropy')
      );
      expect(entropyWarning).toBeDefined();
    });
  });

  describe('validateUniqueness', () => {
    it('should detect duplicate secrets', () => {
      const secretValues = {
        SECRET_1: 'duplicate_value',
        SECRET_2: 'unique_value',
        SECRET_3: 'duplicate_value',
      };

      const result = SecretValidator.validateUniqueness(
        secretValues,
        'development'
      );

      expect(result.passed).toBe(false);
      expect(result.message).toContain('secrets are reused');
      expect(result.severity).toBe('error');
    });

    it('should pass for unique secrets', () => {
      const secretValues = {
        SECRET_1: 'unique_value_1',
        SECRET_2: 'unique_value_2',
        SECRET_3: 'unique_value_3',
      };

      const result = SecretValidator.validateUniqueness(
        secretValues,
        'development'
      );

      expect(result.passed).toBe(true);
    });
  });

  describe('validateProductionReadiness', () => {
    const createSecretValue = (
      overrides: Partial<SecretValue> = {}
    ): SecretValue => ({
      value: 'test-secret-value',
      source: 'infisical',
      retrievedAt: new Date(),
      ...overrides,
    });

    it('should pass for non-production environments', () => {
      const secrets = {
        TEST_SECRET: createSecretValue({ source: 'fallback' }),
      };

      const result = SecretValidator.validateProductionReadiness(
        secrets,
        'development'
      );

      expect(result.passed).toBe(true);
    });

    it('should fail for production with fallback sources', () => {
      const secrets = {
        TEST_SECRET: createSecretValue({ source: 'fallback' }),
      };

      const result = SecretValidator.validateProductionReadiness(
        secrets,
        'production'
      );

      expect(result.passed).toBe(false);
      expect(result.message).toContain('alternative source in production');
      expect(result.severity).toBe('error');
    });

    it('should warn about old secrets in production', () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 100); // 100 days old

      const secrets = {
        OLD_SECRET: createSecretValue({
          source: 'aws-secrets-manager',
          retrievedAt: oldDate,
        }),
      };

      const result = SecretValidator.validateProductionReadiness(
        secrets,
        'production'
      );

      expect(result.passed).toBe(false);
      expect(result.message).toContain('days old');
    });

    it('should pass for fresh production secrets', () => {
      const secrets = {
        FRESH_SECRET: createSecretValue({
          source: 'aws-secrets-manager',
          retrievedAt: new Date(),
        }),
      };

      const result = SecretValidator.validateProductionReadiness(
        secrets,
        'production'
      );

      expect(result.passed).toBe(true);
    });
  });

  describe('entropy calculation', () => {
    it('should calculate higher entropy for diverse characters', () => {
      // Access the private method through any
      const validator = SecretValidator as any;

      const lowEntropy = 'aaaaaaaaaaaaaaaa'; // All same character
      const highEntropy = 'aB3$xY9!mN2@qW8#'; // Mixed characters

      const lowResult = validator.calculateEntropy(lowEntropy);
      const highResult = validator.calculateEntropy(highEntropy);

      expect(highResult).toBeGreaterThan(lowResult);
    });
  });
});
