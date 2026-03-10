// Mock implementation for jsonwebtoken module
/* eslint-env node, jest */

const jwt = {
  sign: jest.fn().mockImplementation((payload, secret, options) => {
    // Return a mock JWT token with simple base64 encoding
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
      .toString('base64')
      .replace(/=/g, '');
    const payloadStr = Buffer.from(
      JSON.stringify({
        ...payload,
        iat: Math.floor(Date.now() / 1000),
        exp:
          Math.floor(Date.now() / 1000) +
          (options?.expiresIn ? parseInt(options.expiresIn) : 3600),
      })
    )
      .toString('base64')
      .replace(/=/g, '');
    const signature = 'mockSignature';

    return `${header}.${payloadStr}.${signature}`;
  }),

  verify: jest.fn().mockImplementation((token, secret, options) => {
    // Mock verification - return decoded payload
    if (token === 'invalid-token') {
      const error = new Error('invalid token');
      error.name = 'JsonWebTokenError';
      throw error;
    }
    if (token === 'expired-token') {
      const error = new Error('jwt expired');
      error.name = 'TokenExpiredError';
      throw error;
    }

    // Return mock payload for valid tokens
    return {
      userId: 'test-user-id',
      email: 'test@example.com',
      role: 'user',
      iat: Math.floor(Date.now() / 1000) - 1800, // 30 minutes ago
      exp: Math.floor(Date.now() / 1000) + 1800, // 30 minutes from now
    };
  }),

  decode: jest.fn().mockImplementation((token, options) => {
    if (!token || token === 'invalid-token') {
      return null;
    }

    return {
      header: { alg: 'HS256', typ: 'JWT' },
      payload: {
        userId: 'test-user-id',
        email: 'test@example.com',
        role: 'user',
        iat: Math.floor(Date.now() / 1000) - 1800,
        exp: Math.floor(Date.now() / 1000) + 1800,
      },
      signature: 'mock-signature',
    };
  }),

  // Error classes
  JsonWebTokenError: class JsonWebTokenError extends Error {
    constructor(message) {
      super(message);
      this.name = 'JsonWebTokenError';
    }
  },

  TokenExpiredError: class TokenExpiredError extends Error {
    constructor(message, expiredAt) {
      super(message);
      this.name = 'TokenExpiredError';
      this.expiredAt = expiredAt;
    }
  },

  NotBeforeError: class NotBeforeError extends Error {
    constructor(message, date) {
      super(message);
      this.name = 'NotBeforeError';
      this.date = date;
    }
  },
};

export default jwt;
