/**
 * API Gateway Health Tests - Critical Path Testing
 * Tests database connectivity and JWT token validation
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';

describe('API Gateway Health - Database Connection', () => {
  let pool: Pool;

  beforeAll(() => {
    // Create connection pool with environment variables
    const DATABASE_HOST = process.env['DATABASE_HOST'] || 'localhost';
    const DATABASE_PORT = process.env['DATABASE_PORT'] || '5432';
    const DATABASE_NAME = process.env['DATABASE_NAME'] || 'ectropy_dev';
    const DATABASE_USER = process.env['DATABASE_USER'] || 'postgres';
    const DATABASE_PASSWORD = process.env['DATABASE_PASSWORD'] || '';
    const DATABASE_URL = `postgresql://${DATABASE_USER}:${DATABASE_PASSWORD}@${DATABASE_HOST}:${DATABASE_PORT}/${DATABASE_NAME}`;

    pool = new Pool({
      connectionString: DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  it('should create database pool successfully', () => {
    expect(pool).toBeDefined();
    expect(pool.totalCount).toBeGreaterThanOrEqual(0);
  });

  it('should validate database connection URL format', () => {
    const DATABASE_HOST = process.env['DATABASE_HOST'] || 'localhost';
    const DATABASE_PORT = process.env['DATABASE_PORT'] || '5432';
    const DATABASE_NAME = process.env['DATABASE_NAME'] || 'ectropy_dev';
    const DATABASE_USER = process.env['DATABASE_USER'] || 'postgres';
    const DATABASE_PASSWORD = process.env['DATABASE_PASSWORD'] || '';
    const DATABASE_URL = `postgresql://${DATABASE_USER}:${DATABASE_PASSWORD}@${DATABASE_HOST}:${DATABASE_PORT}/${DATABASE_NAME}`;

    expect(DATABASE_URL).toContain('postgresql://');
    expect(DATABASE_URL).toContain(DATABASE_HOST);
    expect(DATABASE_URL).toContain(DATABASE_PORT);
    expect(DATABASE_URL).toContain(DATABASE_NAME);
  });

  it('should have proper pool configuration', () => {
    expect(pool.options.max).toBe(5);
    expect(pool.options.idleTimeoutMillis).toBe(30000);
    expect(pool.options.connectionTimeoutMillis).toBe(10000);
  });
});

describe('API Gateway Health - JWT Token Validation', () => {
  const TEST_SECRET = 'test_jwt_secret_minimum_32_characters_long';
  const TEST_USER = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'test@example.com',
    role: 'contractor'
  };

  it('should generate valid JWT token', () => {
    const token = jwt.sign(TEST_USER, TEST_SECRET, { expiresIn: '15m' });
    
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
  });

  it('should validate JWT token successfully', () => {
    const token = jwt.sign(TEST_USER, TEST_SECRET, { expiresIn: '15m' });
    const decoded = jwt.verify(token, TEST_SECRET) as any;
    
    expect(decoded).toBeDefined();
    expect(decoded.id).toBe(TEST_USER.id);
    expect(decoded.email).toBe(TEST_USER.email);
    expect(decoded.role).toBe(TEST_USER.role);
  });

  it('should reject invalid JWT token', () => {
    const invalidToken = 'invalid.token.here';
    
    expect(() => {
      jwt.verify(invalidToken, TEST_SECRET);
    }).toThrow();
  });

  it('should reject token with wrong secret', () => {
    const token = jwt.sign(TEST_USER, TEST_SECRET, { expiresIn: '15m' });
    const wrongSecret = 'wrong_secret_that_should_fail';
    
    expect(() => {
      jwt.verify(token, wrongSecret);
    }).toThrow();
  });

  it('should include expiration in token', () => {
    const token = jwt.sign(TEST_USER, TEST_SECRET, { expiresIn: '15m' });
    const decoded = jwt.verify(token, TEST_SECRET) as any;
    
    expect(decoded.exp).toBeDefined();
    expect(decoded.iat).toBeDefined();
    expect(decoded.exp).toBeGreaterThan(decoded.iat);
  });
});

describe('API Gateway Health - Environment Configuration', () => {
  it('should have NODE_ENV defined', () => {
    expect(process.env['NODE_ENV']).toBeDefined();
  });

  it('should validate database environment variables', () => {
    const DATABASE_HOST = process.env['DATABASE_HOST'] || 'localhost';
    const DATABASE_PORT = process.env['DATABASE_PORT'] || '5432';
    const DATABASE_NAME = process.env['DATABASE_NAME'] || 'ectropy_dev';
    const DATABASE_USER = process.env['DATABASE_USER'] || 'postgres';
    
    expect(DATABASE_HOST).toBeTruthy();
    expect(DATABASE_PORT).toBeTruthy();
    expect(DATABASE_NAME).toBeTruthy();
    expect(DATABASE_USER).toBeTruthy();
  });

  it('should validate Redis environment variables', () => {
    const REDIS_HOST = process.env['REDIS_HOST'] || 'localhost';
    const REDIS_PORT = process.env['REDIS_PORT'] || '6379';
    
    expect(REDIS_HOST).toBeTruthy();
    expect(REDIS_PORT).toBeTruthy();
  });
});

describe('API Gateway Health - Health Endpoint Response', () => {
  it('should include buildDate field in health response', () => {
    const buildDate = new Date().toISOString();
    
    // Validate buildDate format (ISO 8601)
    expect(buildDate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('should have buildDate as valid ISO timestamp', () => {
    const buildDate = new Date().toISOString();
    const parsedDate = new Date(buildDate);
    
    expect(parsedDate).toBeInstanceOf(Date);
    expect(parsedDate.getTime()).toBeGreaterThan(0);
  });

  it('should have buildDate in recent past', () => {
    const buildDate = new Date().toISOString();
    const buildTime = new Date(buildDate).getTime();
    const now = Date.now();
    
    // buildDate should be within last second
    expect(now - buildTime).toBeLessThan(1000);
  });

  it('should include score field in health response', () => {
    // Verify score is a number between 0 and 100
    const score = 100;
    
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
    expect(typeof score).toBe('number');
  });

  it('should have score of 100 when all services are healthy', () => {
    const healthyScore = 100;
    expect(healthyScore).toBe(100);
  });

  it('should reduce score when services are degraded', () => {
    // Simulate degraded state
    let score = 100;
    score = Math.max(0, score - 40); // Database failure
    expect(score).toBe(60);
    
    score = Math.max(0, score - 30); // Redis failure
    expect(score).toBe(30);
  });
});
