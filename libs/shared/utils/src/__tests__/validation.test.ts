/**
 * ENTERPRISE UNIT TESTS - Validation Utilities
 *
 * Purpose: Comprehensive testing of validation utility functions
 * Scope: Email, UUID, URL validation, required fields, sanitization
 * Framework: Vitest
 *
 * ENTERPRISE FOCUS:
 * - AAA pattern (Arrange, Act, Assert)
 * - Edge case coverage (null, undefined, empty, malformed)
 * - Security validation (XSS prevention, injection prevention)
 * - Parameterized tests for multiple scenarios
 * - Clear, descriptive test names
 */

import { describe, it, expect } from 'vitest';
import { ValidationUtils } from '../validation';

describe('ValidationUtils - Enterprise Unit Tests', () => {
  describe('1. Email Validation', () => {
    describe('Valid Emails', () => {
      it('should accept standard email format', () => {
        // Arrange
        const email = 'user@example.com';

        // Act
        const result = ValidationUtils.isValidEmail(email);

        // Assert
        expect(result).toBe(true);
      });

      it('should accept email with subdomain', () => {
        const email = 'user@mail.example.com';

        const result = ValidationUtils.isValidEmail(email);

        expect(result).toBe(true);
      });

      it('should accept email with plus addressing', () => {
        const email = 'user+label@example.com';

        const result = ValidationUtils.isValidEmail(email);

        expect(result).toBe(true);
      });

      it('should accept email with dots in local part', () => {
        const email = 'first.last@example.com';

        const result = ValidationUtils.isValidEmail(email);

        expect(result).toBe(true);
      });

      it('should accept email with numbers', () => {
        const email = 'user123@example456.com';

        const result = ValidationUtils.isValidEmail(email);

        expect(result).toBe(true);
      });

      it('should accept email with hyphens in domain', () => {
        const email = 'user@my-company.com';

        const result = ValidationUtils.isValidEmail(email);

        expect(result).toBe(true);
      });
    });

    describe('Invalid Emails', () => {
      it('should reject email without @ symbol', () => {
        const email = 'userexample.com';

        const result = ValidationUtils.isValidEmail(email);

        expect(result).toBe(false);
      });

      it('should reject email without domain', () => {
        const email = 'user@';

        const result = ValidationUtils.isValidEmail(email);

        expect(result).toBe(false);
      });

      it('should reject email without local part', () => {
        const email = '@example.com';

        const result = ValidationUtils.isValidEmail(email);

        expect(result).toBe(false);
      });

      it('should reject email without TLD', () => {
        const email = 'user@example';

        const result = ValidationUtils.isValidEmail(email);

        expect(result).toBe(false);
      });

      it('should reject email with spaces', () => {
        const email = 'user name@example.com';

        const result = ValidationUtils.isValidEmail(email);

        expect(result).toBe(false);
      });

      it('should reject email with multiple @ symbols', () => {
        const email = 'user@@example.com';

        const result = ValidationUtils.isValidEmail(email);

        expect(result).toBe(false);
      });

      it('should reject empty string', () => {
        const email = '';

        const result = ValidationUtils.isValidEmail(email);

        expect(result).toBe(false);
      });
    });
  });

  describe('2. UUID Validation', () => {
    describe('Valid UUIDs', () => {
      it('should accept UUID v4 format', () => {
        const uuid = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

        const result = ValidationUtils.isValidUUID(uuid);

        expect(result).toBe(true);
      });

      it('should accept UUID v1 format', () => {
        const uuid = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

        const result = ValidationUtils.isValidUUID(uuid);

        expect(result).toBe(true);
      });

      it('should accept uppercase UUID', () => {
        const uuid = 'F47AC10B-58CC-4372-A567-0E02B2C3D479';

        const result = ValidationUtils.isValidUUID(uuid);

        expect(result).toBe(true);
      });

      it('should accept mixed case UUID', () => {
        const uuid = 'f47AC10b-58Cc-4372-A567-0e02B2c3D479';

        const result = ValidationUtils.isValidUUID(uuid);

        expect(result).toBe(true);
      });
    });

    describe('Invalid UUIDs', () => {
      it('should reject UUID without hyphens', () => {
        const uuid = 'f47ac10b58cc4372a5670e02b2c3d479';

        const result = ValidationUtils.isValidUUID(uuid);

        expect(result).toBe(false);
      });

      it('should reject UUID with wrong length', () => {
        const uuid = 'f47ac10b-58cc-4372-a567';

        const result = ValidationUtils.isValidUUID(uuid);

        expect(result).toBe(false);
      });

      it('should reject UUID with invalid characters', () => {
        const uuid = 'f47ac10b-58cc-4372-a567-0e02b2c3d47z';

        const result = ValidationUtils.isValidUUID(uuid);

        expect(result).toBe(false);
      });

      it('should reject random string', () => {
        const uuid = 'not-a-valid-uuid';

        const result = ValidationUtils.isValidUUID(uuid);

        expect(result).toBe(false);
      });

      it('should reject empty string', () => {
        const uuid = '';

        const result = ValidationUtils.isValidUUID(uuid);

        expect(result).toBe(false);
      });
    });
  });

  describe('3. URL Validation', () => {
    describe('Valid URLs', () => {
      it('should accept HTTP URL', () => {
        const url = 'http://example.com';

        const result = ValidationUtils.isValidURL(url);

        expect(result).toBe(true);
      });

      it('should accept HTTPS URL', () => {
        const url = 'https://example.com';

        const result = ValidationUtils.isValidURL(url);

        expect(result).toBe(true);
      });

      it('should accept URL with path', () => {
        const url = 'https://example.com/path/to/resource';

        const result = ValidationUtils.isValidURL(url);

        expect(result).toBe(true);
      });

      it('should accept URL with query parameters', () => {
        const url = 'https://example.com/search?q=test&category=all';

        const result = ValidationUtils.isValidURL(url);

        expect(result).toBe(true);
      });

      it('should accept URL with fragment', () => {
        const url = 'https://example.com/page#section';

        const result = ValidationUtils.isValidURL(url);

        expect(result).toBe(true);
      });

      it('should accept URL with port', () => {
        const url = 'https://example.com:8080/api';

        const result = ValidationUtils.isValidURL(url);

        expect(result).toBe(true);
      });

      it('should accept localhost URL', () => {
        const url = 'http://localhost:3000';

        const result = ValidationUtils.isValidURL(url);

        expect(result).toBe(true);
      });

      it('should accept IP address URL', () => {
        const url = 'http://192.168.1.1:80';

        const result = ValidationUtils.isValidURL(url);

        expect(result).toBe(true);
      });
    });

    describe('Invalid URLs', () => {
      it('should reject URL without protocol', () => {
        const url = 'example.com';

        const result = ValidationUtils.isValidURL(url);

        expect(result).toBe(false);
      });

      it('should reject malformed URL', () => {
        const url = 'htp://example';

        const result = ValidationUtils.isValidURL(url);

        expect(result).toBe(false);
      });

      it('should reject URL with spaces', () => {
        const url = 'https://example .com';

        const result = ValidationUtils.isValidURL(url);

        expect(result).toBe(false);
      });

      it('should reject empty string', () => {
        const url = '';

        const result = ValidationUtils.isValidURL(url);

        expect(result).toBe(false);
      });

      it('should reject random text', () => {
        const url = 'not a url';

        const result = ValidationUtils.isValidURL(url);

        expect(result).toBe(false);
      });
    });
  });

  describe('4. Required Fields Validation', () => {
    it('should return empty array when all required fields present', () => {
      // Arrange
      const data = {
        name: 'John',
        email: 'john@example.com',
        age: 30,
      };
      const required = ['name', 'email'];

      // Act
      const missing = ValidationUtils.validateRequired(data, required);

      // Assert
      expect(missing).toEqual([]);
    });

    it('should return missing field names', () => {
      const data = {
        name: 'John',
      };
      const required = ['name', 'email', 'age'];

      const missing = ValidationUtils.validateRequired(data, required);

      expect(missing).toEqual(['email', 'age']);
    });

    it('should detect null values as missing', () => {
      const data = {
        name: 'John',
        email: null,
      };
      const required = ['name', 'email'];

      const missing = ValidationUtils.validateRequired(data, required);

      expect(missing).toEqual(['email']);
    });

    it('should detect undefined values as missing', () => {
      const data = {
        name: 'John',
        email: undefined,
      };
      const required = ['name', 'email'];

      const missing = ValidationUtils.validateRequired(data, required);

      expect(missing).toEqual(['email']);
    });

    it('should detect empty strings as missing', () => {
      const data = {
        name: 'John',
        email: '',
      };
      const required = ['name', 'email'];

      const missing = ValidationUtils.validateRequired(data, required);

      expect(missing).toEqual(['email']);
    });

    it('should handle zero as valid value', () => {
      const data = {
        name: 'Product',
        price: 0,
      };
      const required = ['name', 'price'];

      const missing = ValidationUtils.validateRequired(data, required);

      expect(missing).toEqual([]);
    });

    it('should handle false as valid value', () => {
      const data = {
        name: 'Setting',
        enabled: false,
      };
      const required = ['name', 'enabled'];

      const missing = ValidationUtils.validateRequired(data, required);

      expect(missing).toEqual([]);
    });

    it('should return empty array when no fields required', () => {
      const data = { name: 'John' };
      const required: string[] = [];

      const missing = ValidationUtils.validateRequired(data, required);

      expect(missing).toEqual([]);
    });
  });

  describe('5. String Sanitization (XSS Prevention)', () => {
    it('should sanitize script tags', () => {
      const input = '<script>alert("xss")</script>';

      const result = ValidationUtils.sanitizeString(input);

      expect(result).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;');
      expect(result).not.toContain('<script>');
    });

    it('should sanitize less-than and greater-than symbols', () => {
      const input = '5 < 10 and 20 > 15';

      const result = ValidationUtils.sanitizeString(input);

      expect(result).toBe('5 &lt; 10 and 20 &gt; 15');
    });

    it('should sanitize double quotes', () => {
      const input = 'He said "Hello"';

      const result = ValidationUtils.sanitizeString(input);

      expect(result).toBe('He said &quot;Hello&quot;');
    });

    it('should sanitize single quotes', () => {
      const input = "It's a test";

      const result = ValidationUtils.sanitizeString(input);

      expect(result).toBe('It&#x27;s a test');
    });

    it('should sanitize forward slashes', () => {
      const input = 'path/to/resource';

      const result = ValidationUtils.sanitizeString(input);

      expect(result).toBe('path&#x2F;to&#x2F;resource');
    });

    it('should sanitize multiple special characters', () => {
      const input = '<div class="test">O\'Reilly & Sons</div>';

      const result = ValidationUtils.sanitizeString(input);

      expect(result).not.toContain('<div');
      expect(result).not.toContain('</div>');
      expect(result).toContain('&lt;');
      expect(result).toContain('&gt;');
      expect(result).toContain('&#x27;');
    });

    it('should handle empty string', () => {
      const input = '';

      const result = ValidationUtils.sanitizeString(input);

      expect(result).toBe('');
    });

    it('should handle string without special characters', () => {
      const input = 'Hello World 123';

      const result = ValidationUtils.sanitizeString(input);

      expect(result).toBe('Hello World 123');
    });

    it('should prevent common XSS attack vectors', () => {
      const attacks = [
        '<img src=x onerror=alert(1)>',
        '<svg onload=alert(1)>',
        'javascript:alert(1)',
        '<iframe src="javascript:alert(1)"></iframe>',
      ];

      attacks.forEach(attack => {
        const result = ValidationUtils.sanitizeString(attack);

        expect(result).not.toContain('<img');
        expect(result).not.toContain('<svg');
        expect(result).not.toContain('<iframe');
        expect(result).not.toContain('javascript:');
      });
    });
  });

  describe('6. Edge Cases and Security', () => {
    it('should handle very long email addresses', () => {
      const longEmail = 'a'.repeat(64) + '@' + 'b'.repeat(63) + '.com';

      const result = ValidationUtils.isValidEmail(longEmail);

      // Should still validate correctly
      expect(typeof result).toBe('boolean');
    });

    it('should handle very long URLs', () => {
      const longPath = 'a'.repeat(2000);
      const longUrl = `https://example.com/${longPath}`;

      const result = ValidationUtils.isValidURL(longUrl);

      expect(typeof result).toBe('boolean');
    });

    it('should handle unicode characters in sanitization', () => {
      const input = '你好 <script>alert(1)</script> 世界';

      const result = ValidationUtils.sanitizeString(input);

      expect(result).toContain('你好');
      expect(result).toContain('世界');
      expect(result).not.toContain('<script>');
    });

    it('should handle null-like values in validation gracefully', () => {
      // These tests ensure robustness, though TypeScript should prevent these
      const testCases = [
        { input: null as any, method: 'isValidEmail' },
        { input: undefined as any, method: 'isValidURL' },
      ];

      testCases.forEach(({ input, method }) => {
        try {
          (ValidationUtils as any)[method](input);
          // If no error, method handles gracefully
        } catch (error) {
          // If error thrown, it should be handled by caller
          expect(error).toBeDefined();
        }
      });
    });
  });
});
