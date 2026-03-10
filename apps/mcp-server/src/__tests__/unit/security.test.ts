/**
 * Security Utilities Unit Tests
 * Tests for constant-time comparison and other security functions
 */

import { describe, it, expect } from 'vitest';
import {
  constantTimeCompare,
  isValidApiKeyFormat,
  sanitizeInput,
  isSecureFilePath,
  isSecureUrl,
  hashForLogging,
} from '../../utils/security.utils.js';

describe('Security Utilities - constantTimeCompare', () => {
  it('should return true for matching strings', () => {
    const key1 = 'test-api-key-12345678901234567890';
    const key2 = 'test-api-key-12345678901234567890';

    expect(constantTimeCompare(key1, key2)).toBe(true);
  });

  it('should return false for different strings', () => {
    const key1 = 'test-api-key-12345678901234567890';
    const key2 = 'different-key-12345678901234567890';

    expect(constantTimeCompare(key1, key2)).toBe(false);
  });

  it('should return false for different length strings', () => {
    const key1 = 'short';
    const key2 = 'much-longer-key-string';

    expect(constantTimeCompare(key1, key2)).toBe(false);
  });

  it('should return false when first string is undefined', () => {
    expect(constantTimeCompare(undefined, 'some-key')).toBe(false);
  });

  it('should return false when second string is undefined', () => {
    expect(constantTimeCompare('some-key', undefined)).toBe(false);
  });

  it('should return false when both strings are undefined', () => {
    expect(constantTimeCompare(undefined, undefined)).toBe(false);
  });

  it('should be case-sensitive', () => {
    const key1 = 'Test-API-Key-12345678901234567890';
    const key2 = 'test-api-key-12345678901234567890';

    expect(constantTimeCompare(key1, key2)).toBe(false);
  });

  it('should handle special characters', () => {
    const key1 = 'key-with-special!@#$%^&*()_+-=[]{}|;:,.<>?';
    const key2 = 'key-with-special!@#$%^&*()_+-=[]{}|;:,.<>?';

    expect(constantTimeCompare(key1, key2)).toBe(true);
  });
});

describe('Security Utilities - isValidApiKeyFormat', () => {
  it('should return true for valid 32+ character key', () => {
    const validKey = 'a'.repeat(32);
    expect(isValidApiKeyFormat(validKey)).toBe(true);
  });

  it('should return false for short keys (< 32 chars)', () => {
    const shortKey = 'short-key';
    expect(isValidApiKeyFormat(shortKey)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isValidApiKeyFormat(undefined)).toBe(false);
  });

  it('should accept alphanumeric and common symbols', () => {
    const validKey = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-:.=+/';
    expect(isValidApiKeyFormat(validKey)).toBe(true);
  });

  it('should reject keys with unsafe characters', () => {
    const unsafeKey = 'key-with-spaces and special chars <script>';
    expect(isValidApiKeyFormat(unsafeKey)).toBe(false);
  });
});

describe('Security Utilities - sanitizeInput', () => {
  it('should trim whitespace', () => {
    const input = '  hello world  ';
    expect(sanitizeInput(input)).toBe('hello world');
  });

  it('should remove control characters', () => {
    const input = 'hello\x00\x01world';
    expect(sanitizeInput(input)).toBe('helloworld');
  });

  it('should preserve newlines and tabs', () => {
    const input = 'hello\nworld\ttab';
    expect(sanitizeInput(input)).toBe('hello\nworld\ttab');
  });

  it('should truncate to max length', () => {
    const input = 'a'.repeat(2000);
    const result = sanitizeInput(input, 100);
    expect(result.length).toBe(100);
  });

  it('should handle empty strings', () => {
    expect(sanitizeInput('')).toBe('');
  });

  it('should use default max length of 1000', () => {
    const input = 'a'.repeat(2000);
    const result = sanitizeInput(input);
    expect(result.length).toBe(1000);
  });
});

describe('Security Utilities - isSecureFilePath', () => {
  it('should reject directory traversal attempts with ..', () => {
    expect(isSecureFilePath('../../../etc/passwd')).toBe(false);
    expect(isSecureFilePath('valid/../../unsafe')).toBe(false);
  });

  it('should reject paths with tilde', () => {
    expect(isSecureFilePath('~/something')).toBe(false);
  });

  it('should reject absolute paths', () => {
    expect(isSecureFilePath('/etc/passwd')).toBe(false);
    expect(isSecureFilePath('/usr/bin/node')).toBe(false);
  });

  it('should reject Windows drive letters', () => {
    expect(isSecureFilePath('C:\\Windows\\System32')).toBe(false);
    expect(isSecureFilePath('D:\\data')).toBe(false);
  });

  it('should reject null bytes', () => {
    expect(isSecureFilePath('file\0.txt')).toBe(false);
  });

  it('should accept safe relative paths', () => {
    expect(isSecureFilePath('docs/readme.md')).toBe(true);
    expect(isSecureFilePath('src/index.ts')).toBe(true);
  });

  it('should accept simple filenames', () => {
    expect(isSecureFilePath('file.txt')).toBe(true);
    expect(isSecureFilePath('data.json')).toBe(true);
  });

  it('should reject empty paths', () => {
    expect(isSecureFilePath('')).toBe(false);
  });
});

describe('Security Utilities - isSecureUrl', () => {
  it('should accept http URLs', () => {
    expect(isSecureUrl('http://example.com')).toBe(true);
  });

  it('should accept https URLs', () => {
    expect(isSecureUrl('https://example.com')).toBe(true);
  });

  it('should reject ftp URLs', () => {
    expect(isSecureUrl('ftp://example.com')).toBe(false);
  });

  it('should reject file URLs', () => {
    expect(isSecureUrl('file:///etc/passwd')).toBe(false);
  });

  it('should reject javascript URLs', () => {
    expect(isSecureUrl('javascript:alert(1)')).toBe(false);
  });

  it('should reject invalid URLs', () => {
    expect(isSecureUrl('not a url')).toBe(false);
  });

  it('should reject empty URLs', () => {
    expect(isSecureUrl('')).toBe(false);
  });

  // In test environment (not production), localhost should be allowed
  it('should handle localhost based on environment', () => {
    const originalEnv = process.env.NODE_ENV;

    // Test environment allows localhost
    process.env.NODE_ENV = 'test';
    expect(isSecureUrl('http://localhost:3000')).toBe(true);

    // Restore
    process.env.NODE_ENV = originalEnv;
  });
});

describe('Security Utilities - hashForLogging', () => {
  it('should return 8-character hash', () => {
    const hash = hashForLogging('sensitive-data');
    expect(hash.length).toBe(8);
  });

  it('should return consistent hash for same input', () => {
    const input = 'test-data';
    const hash1 = hashForLogging(input);
    const hash2 = hashForLogging(input);
    expect(hash1).toBe(hash2);
  });

  it('should return different hashes for different inputs', () => {
    const hash1 = hashForLogging('data-1');
    const hash2 = hashForLogging('data-2');
    expect(hash1).not.toBe(hash2);
  });

  it('should return only hex characters', () => {
    const hash = hashForLogging('test');
    expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
  });
});
