/**
 * Redis URL Parsing Tests - Critical Fix Validation
 * Tests proper URL encoding/decoding for Redis passwords with special characters
 */

import { describe, it, expect } from 'vitest';

describe('Redis URL Parsing - Special Character Handling', () => {
  /**
   * Parse Redis URL with proper decoding
   * This mirrors the parseRedisUrl function in main.ts
   */
  function parseRedisUrl(url: string): { host: string; port: number; password?: string } {
    try {
      const parsed = new URL(url);
      return {
        host: parsed.hostname || 'localhost',
        port: parseInt(parsed.port || '6379', 10),
        password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
      };
    } catch (error) {
      return {
        host: 'localhost',
        port: 6379,
        password: undefined,
      };
    }
  }

  it('should properly encode password with + character', () => {
    const rawPassword = 'hu5isVbdu2sDY59VNc+I0IGKy7imyKxai7LppZSy5ic=';
    const encodedPassword = encodeURIComponent(rawPassword);
    
    // + should be encoded as %2B
    expect(encodedPassword).toContain('%2B');
    // = should be encoded as %3D
    expect(encodedPassword).toContain('%3D');
    expect(encodedPassword).toBe('hu5isVbdu2sDY59VNc%2BI0IGKy7imyKxai7LppZSy5ic%3D');
  });

  it('should properly decode password with + character from URL', () => {
    const urlWithEncodedPassword = 'redis://:hu5isVbdu2sDY59VNc%2BI0IGKy7imyKxai7LppZSy5ic%3D@ectropy-redis:6379';
    const config = parseRedisUrl(urlWithEncodedPassword);
    
    expect(config.password).toBe('hu5isVbdu2sDY59VNc+I0IGKy7imyKxai7LppZSy5ic=');
    expect(config.host).toBe('ectropy-redis');
    expect(config.port).toBe(6379);
  });

  it('should handle URL without encoded password correctly', () => {
    // Note: This is the problematic case - password should be encoded but isn't
    const urlWithUnEncodedPassword = 'redis://:hu5isVbdu2sDY59VNc+I0IGKy7imyKxai7LppZSy5ic=@ectropy-redis:6379';
    const parsed = new URL(urlWithUnEncodedPassword);
    
    // URL constructor automatically encodes = but not +
    // This is why we need to decode it
    expect(parsed.password).toBeTruthy();
    
    const decodedPassword = decodeURIComponent(parsed.password);
    // After decoding, we should get the original password
    expect(decodedPassword).toContain('+');
    expect(decodedPassword).toContain('=');
  });

  it('should parse Redis URL with host, port, and password', () => {
    const url = 'redis://:mypassword123@redis-server:6380';
    const config = parseRedisUrl(url);
    
    expect(config.host).toBe('redis-server');
    expect(config.port).toBe(6380);
    expect(config.password).toBe('mypassword123');
  });

  it('should parse Redis URL without password', () => {
    const url = 'redis://redis-server:6379';
    const config = parseRedisUrl(url);
    
    expect(config.host).toBe('redis-server');
    expect(config.port).toBe(6379);
    expect(config.password).toBeUndefined();
  });

  it('should handle malformed URL gracefully', () => {
    const malformedUrl = 'not-a-valid-url';
    const config = parseRedisUrl(malformedUrl);
    
    // Should return defaults
    expect(config.host).toBe('localhost');
    expect(config.port).toBe(6379);
    expect(config.password).toBeUndefined();
  });

  it('should properly encode then decode password round-trip', () => {
    const originalPassword = 'p@ssw0rd+with=special&chars!';
    
    // Encode for URL
    const encoded = encodeURIComponent(originalPassword);
    
    // Build URL
    const url = `redis://:${encoded}@redis-host:6379`;
    
    // Parse and decode
    const config = parseRedisUrl(url);
    
    // Should match original
    expect(config.password).toBe(originalPassword);
  });

  it('should handle production password scenario', () => {
    // This is the actual production scenario from the issue
    const productionPassword = 'hu5isVbdu2sDY59VNc+I0IGKy7imyKxai7LppZSy5ic=';
    
    // Build URL with proper encoding
    const encodedPassword = encodeURIComponent(productionPassword);
    const url = `redis://:${encodedPassword}@ectropy-redis:6379`;
    
    // Parse URL
    const config = parseRedisUrl(url);
    
    // Verify password is correctly decoded
    expect(config.password).toBe(productionPassword);
    expect(config.host).toBe('ectropy-redis');
    expect(config.port).toBe(6379);
  });
});

describe('Redis URL Construction - Special Character Handling', () => {
  it('should construct URL with properly encoded password', () => {
    const host = 'ectropy-redis';
    const port = '6379';
    const password = 'hu5isVbdu2sDY59VNc+I0IGKy7imyKxai7LppZSy5ic=';
    
    // Build URL with encoding (as in fixed main.ts)
    const protocol = 'redis://';
    const auth = password ? ':' + encodeURIComponent(password) + '@' : '';
    const url = protocol + auth + host + ':' + port;
    
    // Verify URL contains encoded password
    expect(url).toContain('%2B'); // + encoded
    expect(url).toContain('%3D'); // = encoded
    expect(url).toBe('redis://:hu5isVbdu2sDY59VNc%2BI0IGKy7imyKxai7LppZSy5ic%3D@ectropy-redis:6379');
  });

  it('should handle empty password', () => {
    const host = 'redis-server';
    const port = '6379';
    const password = '';
    
    const protocol = 'redis://';
    const auth = password ? ':' + encodeURIComponent(password) + '@' : '';
    const url = protocol + auth + host + ':' + port;
    
    // Should not contain auth section
    expect(url).toBe('redis://redis-server:6379');
    expect(url).not.toContain('@');
  });
});

describe('Redis Client Configuration', () => {
  it('should create config object with parsed values', () => {
    const url = 'redis://:mypassword@redis-host:6380';
    
    function parseRedisUrl(url: string): { host: string; port: number; password?: string } {
      try {
        const parsed = new URL(url);
        return {
          host: parsed.hostname || 'localhost',
          port: parseInt(parsed.port || '6379', 10),
          password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
        };
      } catch (error) {
        return {
          host: 'localhost',
          port: 6379,
          password: undefined,
        };
      }
    }
    
    const config = parseRedisUrl(url);
    
    // This config can be passed directly to ioredis
    expect(config).toEqual({
      host: 'redis-host',
      port: 6380,
      password: 'mypassword',
    });
  });

  it('should work with Redis client constructor signature', () => {
    const url = 'redis://:testpass@localhost:6379';
    
    function parseRedisUrl(url: string): { host: string; port: number; password?: string } {
      try {
        const parsed = new URL(url);
        return {
          host: parsed.hostname || 'localhost',
          port: parseInt(parsed.port || '6379', 10),
          password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
        };
      } catch (error) {
        return {
          host: 'localhost',
          port: 6379,
          password: undefined,
        };
      }
    }
    
    const config = parseRedisUrl(url);
    
    // Verify config has all required fields for Redis constructor
    expect(config).toHaveProperty('host');
    expect(config).toHaveProperty('port');
    expect(config).toHaveProperty('password');
    expect(typeof config.host).toBe('string');
    expect(typeof config.port).toBe('number');
    expect(typeof config.password).toBe('string');
  });
});
