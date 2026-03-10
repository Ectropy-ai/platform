// Mock implementation for axios module
/* eslint-env node, jest */

const axiosMock = {
  // Main axios function
  request: jest.fn(() =>
    Promise.resolve({
      data: {},
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {},
    })
  ),

  get: jest.fn((url, config) => {
    // Handle health check endpoints
    if (url.includes('/health')) {
      return Promise.resolve({
        data: {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          version: '1.0.0',
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { url, ...config },
      });
    }

    // Handle Speckle GraphQL endpoints
    if (url.includes('speckle') || url.includes('graphql')) {
      return Promise.resolve({
        data: {
          data: {
            serverInfo: {
              name: 'Speckle Server',
              version: '2.25.9',
            },
          },
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { url, ...config },
      });
    }

    // Handle manufacturer endpoints
    if (url.includes('/manufacturer/categories')) {
      return Promise.resolve({
        data: {
          categories: ['steel', 'concrete', 'timber'],
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { url, ...config },
      });
    }

    if (url.includes('/manufacturer/search')) {
      return Promise.resolve({
        data: {
          products: [{ id: 1, name: 'Test Product', category: 'steel' }],
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { url, ...config },
      });
    }

    // Mock responses based on URL patterns
    if (url.includes('/api/projects')) {
      return Promise.resolve({
        data: {
          projects: [
            {
              id: 'project-1',
              name: 'Test Project',
              status: 'active',
            },
          ],
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { url, ...config },
      });
    }

    if (url.includes('/api/users')) {
      return Promise.resolve({
        data: {
          users: [
            {
              id: 'user-1',
              email: 'test@example.com',
              role: 'user',
            },
          ],
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { url, ...config },
      });
    }

    // Default successful response
    return Promise.resolve({
      data: { message: 'Mock response' },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: { url, ...config },
    });
  }),

  post: jest.fn((url, data, config) => {
    if (url.includes('/api/auth/login')) {
      return Promise.resolve({
        data: {
          token: 'mock-jwt-token',
          user: {
            id: 'user-1',
            email: 'test@example.com',
            role: 'user',
          },
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { url, data, ...config },
      });
    }

    // Default post response
    return Promise.resolve({
      data: { id: 'created-item-id', ...data },
      status: 201,
      statusText: 'Created',
      headers: {},
      config: { url, data, ...config },
    });
  }),

  put: jest.fn((url, data, config) => {
    return Promise.resolve({
      data: { id: 'updated-item-id', ...data },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: { url, data, ...config },
    });
  }),

  patch: jest.fn((url, data, config) => {
    return Promise.resolve({
      data: { id: 'patched-item-id', ...data },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: { url, data, ...config },
    });
  }),

  delete: jest.fn((url, config) => {
    return Promise.resolve({
      data: { message: 'Deleted successfully' },
      status: 204,
      statusText: 'No Content',
      headers: {},
      config: { url, ...config },
    });
  }),

  head: jest.fn((url, config) => {
    return Promise.resolve({
      data: '',
      status: 200,
      statusText: 'OK',
      headers: {},
      config: { url, ...config },
    });
  }),

  options: jest.fn((url, config) => {
    return Promise.resolve({
      data: '',
      status: 200,
      statusText: 'OK',
      headers: {
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      },
      config: { url, ...config },
    });
  }),

  // Axios create function for instances
  create: jest.fn((config) => {
    const instance = { ...axiosMock };
    instance.defaults = {
      baseURL: config?.baseURL || '',
      headers: config?.headers || {},
      timeout: config?.timeout || 0,
      ...config,
    };
    return instance;
  }),

  // Default properties
  defaults: {
    headers: {
      common: {
        Accept: 'application/json, text/plain, */*',
      },
      delete: {},
      get: {},
      head: {},
      post: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      put: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      patch: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
    timeout: 0,
    xsrfCookieName: 'XSRF-TOKEN',
    xsrfHeaderName: 'X-XSRF-TOKEN',
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

  isCancel: jest.fn(() => false),
  CancelToken: {
    source: jest.fn(() => ({
      token: 'mock-cancel-token',
      cancel: jest.fn(),
    })),
  },

  // Mock for error responses
  mockError: (status = 500, message = 'Mock Error') => {
    const error = new Error(message);
    error.response = {
      data: { error: message },
      status,
      statusText: status === 404 ? 'Not Found' : 'Internal Server Error',
      headers: {},
      config: {},
    };
    error.request = {};
    error.config = {};
    return error;
  },
};

// Make the mock function callable and promise-like
const axios = jest.fn((config) => {
  const url = typeof config === 'string' ? config : config.url;
  return axiosMock.get(url, config);
});

// Copy all methods to the axios function
Object.assign(axios, axiosMock);

export default axios;
