/**
 * Mock axios for testing
 * Provides configurable mock responses for HTTP requests
 */

const axios = {
  get: jest.fn(() => Promise.resolve({ data: {} })),
  post: jest.fn(() => Promise.resolve({ data: {} })),
  put: jest.fn(() => Promise.resolve({ data: {} })),
  delete: jest.fn(() => Promise.resolve({ data: {} })),
  patch: jest.fn(() => Promise.resolve({ data: {} })),
  request: jest.fn(() => Promise.resolve({ data: {} })),

  create: jest.fn(() => axios),

  defaults: {
    headers: {
      common: {},
      get: {},
      post: {},
      put: {},
      delete: {},
      patch: {},
    },
    timeout: 5000,
  },

  interceptors: {
    request: {
      use: jest.fn(),
      eject: jest.fn(),
    },
    response: {
      use: jest.fn(),
      eject: jest.fn(),
    },
  },

  // Mock specific responses for Ectropy endpoints
  mockImplementationOnce: (method, url, response) => {
    axios[method].mockImplementationOnce(() => Promise.resolve(response));
  },

  // Reset all mocks
  resetMocks: () => {
    Object.keys(axios).forEach((key) => {
      if (typeof axios[key] === 'function' && axios[key].mockReset) {
        axios[key].mockReset();
      }
    });
  },
};

export default axios;
