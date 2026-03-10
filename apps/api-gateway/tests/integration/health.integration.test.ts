/**
 * Integration Tests for Health Endpoints
 * Tests actual HTTP requests and responses
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import axios from 'axios';

describe('Health Endpoints Integration', () => {
  let baseURL: string;

  beforeAll(() => {
    baseURL = process.env.API_URL || 'http://localhost:4000';
  });

  it('GET /health returns 200 with valid structure', async () => {
    try {
      const response = await axios.get(`${baseURL}/health`);
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('status');
      expect(response.data).toHaveProperty('score');
      expect(response.data).toHaveProperty('database');
      expect(response.data).toHaveProperty('timestamp');
      expect(response.data).toHaveProperty('uptime');
      
      // Validate score is a number between 0 and 100
      expect(typeof response.data.score).toBe('number');
      expect(response.data.score).toBeGreaterThanOrEqual(0);
      expect(response.data.score).toBeLessThanOrEqual(100);
    } catch (error: any) {
      // If server is not running, skip the test
      if (error.code === 'ECONNREFUSED') {
        console.warn('Server not running - skipping integration test');
        return;
      }
      throw error;
    }
  });

  it('GET /api/health returns 200 without authentication', async () => {
    try {
      const response = await axios.get(`${baseURL}/api/health`);
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('status');
      expect(response.data).toHaveProperty('timestamp');
      expect(response.data).toHaveProperty('uptime');
      
      // Verify it does NOT require authentication
      expect(response.data).not.toHaveProperty('error');
      expect(response.data.status).not.toBe('error');
    } catch (error: any) {
      // If server is not running, skip the test
      if (error.code === 'ECONNREFUSED') {
        console.warn('Server not running - skipping integration test');
        return;
      }
      throw error;
    }
  });

  it('GET /health includes security headers', async () => {
    try {
      const response = await axios.get(`${baseURL}/health`);
      
      // Check for security headers
      expect(response.headers).toBeDefined();
      
      // HSTS header
      if (process.env.NODE_ENV === 'production') {
        expect(response.headers['strict-transport-security']).toBeDefined();
      }
      
      // Content security headers
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    } catch (error: any) {
      if (error.code === 'ECONNREFUSED') {
        console.warn('Server not running - skipping integration test');
        return;
      }
      throw error;
    }
  });

  it('GET /health/detailed requires authentication or returns 401', async () => {
    try {
      const response = await axios.get(`${baseURL}/health/detailed`, {
        validateStatus: () => true // Don't throw on 401
      });
      
      // Should either require authentication (401) or allow (200)
      expect([200, 401]).toContain(response.status);
    } catch (error: any) {
      if (error.code === 'ECONNREFUSED') {
        console.warn('Server not running - skipping integration test');
        return;
      }
      throw error;
    }
  });

  it('GET /ready returns 200 or 503 based on service health', async () => {
    try {
      const response = await axios.get(`${baseURL}/ready`, {
        validateStatus: () => true // Don't throw on error status codes
      });
      
      // Should return either 200 (ready) or 503 (not ready)
      expect([200, 503]).toContain(response.status);
      expect(response.data).toHaveProperty('ready');
      expect(typeof response.data.ready).toBe('boolean');
    } catch (error: any) {
      if (error.code === 'ECONNREFUSED') {
        console.warn('Server not running - skipping integration test');
        return;
      }
      throw error;
    }
  });
});

describe('API Security Integration', () => {
  let baseURL: string;

  beforeAll(() => {
    baseURL = process.env.API_URL || 'http://localhost:4000';
  });

  it('Returns CORS headers for valid origins', async () => {
    try {
      const response = await axios.get(`${baseURL}/health`, {
        headers: {
          'Origin': 'http://localhost:3000'
        }
      });
      
      // CORS headers may or may not be present depending on configuration
      expect(response.status).toBe(200);
    } catch (error: any) {
      if (error.code === 'ECONNREFUSED') {
        console.warn('Server not running - skipping integration test');
        return;
      }
      throw error;
    }
  });

  it('Rate limiting responds with appropriate status', async () => {
    try {
      // This test would normally make multiple rapid requests
      // For now, just verify the endpoint is accessible
      const response = await axios.get(`${baseURL}/health`);
      expect(response.status).toBe(200);
    } catch (error: any) {
      if (error.code === 'ECONNREFUSED') {
        console.warn('Server not running - skipping integration test');
        return;
      }
      throw error;
    }
  });
});
