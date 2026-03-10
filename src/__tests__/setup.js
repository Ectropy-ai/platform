// Global test setup for Ectropy Platform - TypeScript version
// This file provides type-safe setup for Jest tests
// Mock environment variables for consistent testing
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'REDACTED';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/ectropy_test';
process.env.REDIS_URL = 'redis://localhost:6379/1';
process.env.SPECKLE_SERVER_URL = 'https://speckle.test';
// Global test utilities
global.testHelpers = {
  createMockUser: () => ({
    id: 'test-user-id',
    email: 'test@example.com',
    role: 'user',
    permissions: ['read', 'write'],
    createdAt: new Date('2023-01-01'),
  }),
  createMockProject: () => ({
    id: 'test-project-id',
    name: 'Test Project',
    status: 'active',
    ownerId: 'test-user-id',
    createdAt: new Date('2023-01-01'),
  }),
  createMockTemplate: () => ({
    templateId: 'test-template-id',
    name: 'Test Template',
    version: '1.0.0',
    projectId: 'test-project-id',
    isActive: true,
    metadata: {},
  }),
  createMockDbPool: () => ({
    query: jest.fn(),
    connect: jest.fn(),
    end: jest.fn(),
  }),
};
export {};
//# sourceMappingURL=setup.js.map
