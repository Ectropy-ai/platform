/**
 * Auth Configuration Tests
 * Tests OAuth callback URL generation with different environment configurations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('Auth Configuration - OAuth Callback URL', () => {
  // Store original environment variables
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear relevant environment variables before each test
    delete process.env.GOOGLE_CALLBACK_URL;
    delete process.env.BASE_URL;
    delete process.env.NODE_ENV;
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.SESSION_SECRET;
    
    // Set required variables to avoid errors
    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
    process.env.SESSION_SECRET = 'test-session-secret';
  });

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv };
    
    // Clear module cache to force re-evaluation of authConfig
    try {
      const configPath = require.resolve('../config/auth.config.js');
      if (require.cache[configPath]) {
        delete require.cache[configPath];
      }
    } catch (e) {
      // Module not yet loaded, no need to clear
    }
  });

  it('should use GOOGLE_CALLBACK_URL when explicitly set', async () => {
    process.env.GOOGLE_CALLBACK_URL = 'https://custom.domain.com/custom/callback';
    process.env.NODE_ENV = 'production';
    process.env.BASE_URL = 'https://ectropy.ai';
    
    // Dynamic import to force re-evaluation
    const { authConfig } = await import('../config/auth.config.js');
    
    expect(authConfig.google.callbackURL).toBe('https://custom.domain.com/custom/callback');
  });

  it('should construct from BASE_URL when GOOGLE_CALLBACK_URL is not set', async () => {
    process.env.BASE_URL = 'https://staging.ectropy.ai';
    process.env.NODE_ENV = 'staging';
    
    const { authConfig } = await import('../config/auth.config.js');
    
    expect(authConfig.google.callbackURL).toBe('https://staging.ectropy.ai/api/auth/google/callback');
  });

  it('should use production default when NODE_ENV is production', async () => {
    process.env.NODE_ENV = 'production';
    
    const { authConfig } = await import('../config/auth.config.js');
    
    expect(authConfig.google.callbackURL).toBe('https://ectropy.ai/api/auth/google/callback');
  });

  it('should use staging default when NODE_ENV is staging', async () => {
    process.env.NODE_ENV = 'staging';
    
    const { authConfig } = await import('../config/auth.config.js');
    
    expect(authConfig.google.callbackURL).toBe('https://staging.ectropy.ai/api/auth/google/callback');
  });

  it('should use development default when NODE_ENV is development', async () => {
    process.env.NODE_ENV = 'development';
    
    const { authConfig } = await import('../config/auth.config.js');
    
    expect(authConfig.google.callbackURL).toBe('http://localhost:3001/api/auth/google/callback');
  });

  it('should default to localhost for test/CI environments', async () => {
    process.env.NODE_ENV = 'test';
    
    const { authConfig } = await import('../config/auth.config.js');
    
    expect(authConfig.google.callbackURL).toBe('http://localhost:3001/api/auth/google/callback');
  });

  it('should always include /api/ prefix in callback URL', async () => {
    const environments = [
      { NODE_ENV: 'production', expected: 'https://ectropy.ai/api/auth/google/callback' },
      { NODE_ENV: 'staging', expected: 'https://staging.ectropy.ai/api/auth/google/callback' },
      { NODE_ENV: 'development', expected: 'http://localhost:3001/api/auth/google/callback' },
      { NODE_ENV: 'test', expected: 'http://localhost:3001/api/auth/google/callback' }
    ];
    
    for (const env of environments) {
      process.env.NODE_ENV = env.NODE_ENV;
      
      // Clear cache before each import
      try {
        const configPath = require.resolve('../config/auth.config.js');
        if (require.cache[configPath]) {
          delete require.cache[configPath];
        }
      } catch (e) {
        // Module not yet loaded, no need to clear
      }
      
      const { authConfig } = await import('../config/auth.config.js');
      expect(authConfig.google.callbackURL).toContain('/api/auth/google/callback');
      expect(authConfig.google.callbackURL).toBe(env.expected);
    }
  });

  it('should have correct priority order: GOOGLE_CALLBACK_URL > BASE_URL > NODE_ENV', async () => {
    // Test 1: Only NODE_ENV
    process.env.NODE_ENV = 'production';
    let config = await import('../config/auth.config.js');
    expect(config.authConfig.google.callbackURL).toBe('https://ectropy.ai/api/auth/google/callback');
    
    // Clear cache
    delete require.cache[require.resolve('../config/auth.config.js')];
    
    // Test 2: BASE_URL overrides NODE_ENV
    process.env.BASE_URL = 'https://custom.ectropy.ai';
    config = await import('../config/auth.config.js');
    expect(config.authConfig.google.callbackURL).toBe('https://custom.ectropy.ai/api/auth/google/callback');
    
    // Clear cache
    delete require.cache[require.resolve('../config/auth.config.js')];
    
    // Test 3: GOOGLE_CALLBACK_URL overrides everything
    process.env.GOOGLE_CALLBACK_URL = 'https://override.domain.com/callback';
    config = await import('../config/auth.config.js');
    expect(config.authConfig.google.callbackURL).toBe('https://override.domain.com/callback');
  });

  it('should not use wrong domain ectropy.com', async () => {
    const environments = ['production', 'staging', 'development', 'test'];
    
    for (const env of environments) {
      process.env.NODE_ENV = env;
      
      // Clear cache
      try {
        const configPath = require.resolve('../config/auth.config.js');
        if (require.cache[configPath]) {
          delete require.cache[configPath];
        }
      } catch (e) {
        // Module not yet loaded, no need to clear
      }
      
      const { authConfig } = await import('../config/auth.config.js');
      expect(authConfig.google.callbackURL).not.toContain('ectropy.com');
    }
  });

  it('should have required authentication configuration fields', async () => {
    process.env.NODE_ENV = 'development';
    
    const { authConfig } = await import('../config/auth.config.js');
    
    // Check google config
    expect(authConfig.google).toBeDefined();
    expect(authConfig.google.clientID).toBe('test-client-id');
    expect(authConfig.google.clientSecret).toBe('test-client-secret');
    expect(authConfig.google.callbackURL).toBeDefined();
    
    // Check session config
    expect(authConfig.session).toBeDefined();
    expect(authConfig.session.secret).toBe('test-session-secret');
    expect(authConfig.session.resave).toBe(false);
    expect(authConfig.session.saveUninitialized).toBe(false);
    expect(authConfig.session.cookie).toBeDefined();
    expect(authConfig.session.cookie.httpOnly).toBe(true);
    expect(authConfig.session.cookie.maxAge).toBe(24 * 60 * 60 * 1000);
    
    // Check redis config
    expect(authConfig.redis).toBeDefined();
    expect(authConfig.redis.url).toBeDefined();
  });

  it('should set secure cookie only in production', async () => {
    // Test production
    process.env.NODE_ENV = 'production';
    let config = await import('../config/auth.config.js');
    expect(config.authConfig.session.cookie.secure).toBe(true);
    
    // Clear cache
    delete require.cache[require.resolve('../config/auth.config.js')];
    
    // Test development
    process.env.NODE_ENV = 'development';
    config = await import('../config/auth.config.js');
    expect(config.authConfig.session.cookie.secure).toBe(false);
  });
});
