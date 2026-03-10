// Mock implementation for fs/promises module
/* eslint-env node, jest */

const fsMock = {
  readFile: jest.fn(async (path, encoding) => {
    // Default mock responses for common files
    if (path.includes('package.json')) {
      return JSON.stringify({
        name: 'test-package',
        version: '1.0.0',
      });
    }
    if (path.includes('.env')) {
      return 'NODE_ENV=test\nJWT_SECRET=test-secret-key\nDATABASE_URL=postgres://test:test@localhost:5432/test';
    }
    if (path.includes('config')) {
      return JSON.stringify({
        database: {
          host: 'localhost',
          port: 5432,
          name: 'test_db',
        },
      });
    }
    // Default content for other files
    return 'mock file content';
  }),

  writeFile: jest.fn(async (path, data) => {
    // Mock successful write
    return Promise.resolve();
  }),

  appendFile: jest.fn(async (path, data) => {
    return Promise.resolve();
  }),

  mkdir: jest.fn(async (path, options) => {
    return Promise.resolve();
  }),

  rmdir: jest.fn(async (path, options) => {
    return Promise.resolve();
  }),

  unlink: jest.fn(async (path) => {
    return Promise.resolve();
  }),

  access: jest.fn(async (path, mode) => {
    // Mock file exists
    return Promise.resolve();
  }),

  stat: jest.fn(async (path) => {
    return Promise.resolve({
      isFile: () => true,
      isDirectory: () => false,
      size: 1024,
      mtime: new Date(),
      ctime: new Date(),
    });
  }),

  readdir: jest.fn(async (path, options) => {
    // Mock directory listing
    return Promise.resolve(['file1.txt', 'file2.json', 'subdirectory']);
  }),

  copyFile: jest.fn(async (src, dest) => {
    return Promise.resolve();
  }),

  rename: jest.fn(async (oldPath, newPath) => {
    return Promise.resolve();
  }),

  constants: {
    F_OK: 0,
    R_OK: 4,
    W_OK: 2,
    X_OK: 1,
  },
};

export default fsMock;
