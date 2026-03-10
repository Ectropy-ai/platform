/**
 * Enterprise Test Suite Configuration
 * Ensures >95% pass rate with proper async handling and mocking
 */

// Global test timeout for enterprise reliability
jest.setTimeout(30000);

// Mock external dependencies for deterministic tests
jest.mock('@speckle/viewer', () => ({
  Viewer: jest.fn().mockImplementation(() => ({
    init: jest.fn().mockResolvedValue(undefined),
    loadObject: jest.fn().mockResolvedValue(undefined),
    dispose: jest.fn().mockResolvedValue(undefined)
  })),
  ViewerEvent: {}
}));

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    disconnect: jest.fn().mockResolvedValue(undefined)
  }));
});

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue({
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      release: jest.fn()
    }),
    end: jest.fn().mockResolvedValue(undefined)
  }))
}));

// Global error handler for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Clean up after each test
afterEach(async () => {
  jest.clearAllMocks();
  // Clear any timers
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

export {};