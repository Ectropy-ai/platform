/**
 * Mock Redis client for testing
 */

const mockRedisClient = {
  get: jest.fn(() => Promise.resolve(null)),
  set: jest.fn(() => Promise.resolve('OK')),
  del: jest.fn(() => Promise.resolve(1)),
  exists: jest.fn(() => Promise.resolve(0)),
  expire: jest.fn(() => Promise.resolve(1)),
  ttl: jest.fn(() => Promise.resolve(-1)),
  incr: jest.fn(() => Promise.resolve(1)),
  decr: jest.fn(() => Promise.resolve(0)),
  hget: jest.fn(() => Promise.resolve(null)),
  hset: jest.fn(() => Promise.resolve(1)),
  hdel: jest.fn(() => Promise.resolve(1)),
  hgetall: jest.fn(() => Promise.resolve({})),
  lpush: jest.fn(() => Promise.resolve(1)),
  rpop: jest.fn(() => Promise.resolve(null)),
  sadd: jest.fn(() => Promise.resolve(1)),
  srem: jest.fn(() => Promise.resolve(1)),
  smembers: jest.fn(() => Promise.resolve([])),
  publish: jest.fn(() => Promise.resolve(0)),
  subscribe: jest.fn(),
  unsubscribe: jest.fn(),
  on: jest.fn(),
  off: jest.fn(),
  connect: jest.fn(() => Promise.resolve()),
  disconnect: jest.fn(() => Promise.resolve()),
  quit: jest.fn(() => Promise.resolve()),
  status: 'ready',

  // Mock specific Redis operations for testing
  mockCacheHit: (key, value) => {
    mockRedisClient.get.mockImplementation((k) =>
      k === key ? Promise.resolve(JSON.stringify(value)) : Promise.resolve(null)
    );
  },

  mockCacheMiss: (key) => {
    mockRedisClient.get.mockImplementation((k) =>
      k === key ? Promise.resolve(null) : Promise.resolve(null)
    );
  },

  // Reset all mocks
  resetMocks: () => {
    Object.keys(mockRedisClient).forEach((key) => {
      if (
        typeof mockRedisClient[key] === 'function' &&
        mockRedisClient[key].mockReset
      ) {
        mockRedisClient[key].mockReset();
      }
    });
  },
};

// IORedis constructor mock
const IORedis = jest.fn(() => mockRedisClient);
IORedis.prototype = mockRedisClient;

export default IORedis;
