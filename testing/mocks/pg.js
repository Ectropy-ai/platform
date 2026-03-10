/**
 * Mock PostgreSQL client for testing
 */

const mockQuery = jest.fn(() => Promise.resolve({ rows: [], rowCount: 0 }));
const mockConnect = jest.fn(() => Promise.resolve());
const mockEnd = jest.fn(() => Promise.resolve());

const mockClient = {
  query: mockQuery,
  connect: mockConnect,
  end: mockEnd,
  on: jest.fn(),
  off: jest.fn(),
  release: jest.fn(),
};

const mockPool = {
  query: mockQuery,
  connect: jest.fn(() => Promise.resolve(mockClient)),
  end: mockEnd,
  on: jest.fn(),
  off: jest.fn(),
  totalCount: 0,
  idleCount: 0,
  waitingCount: 0,
};

const pg = {
  Client: jest.fn(() => mockClient),
  Pool: jest.fn(() => mockPool),

  // Mock query result builders
  mockQueryResult: (rows = [], rowCount = null) => ({
    rows,
    rowCount: rowCount || rows.length,
    command: 'SELECT',
    oid: null,
    fields: [],
  }),

  // Mock error responses
  mockQueryError: (message = 'Mock database error', code = '23505') => {
    const error = new Error(message);
    error.code = code;
    return error;
  },

  // Reset all mocks
  resetMocks: () => {
    mockQuery.mockReset();
    mockConnect.mockReset();
    mockEnd.mockReset();
  },
};

export default pg;
