// Mock implementation for pg (PostgreSQL) module
/* eslint-env node, jest */

// Mock Pool class
class MockPool {
  constructor(config) {
    this.config = config;
    this.totalCount = 0;
    this.idleCount = 0;
    this.waitingCount = 0;
  }

  async connect() {
    return new MockClient();
  }

  async query(text, params) {
    // Mock different query responses based on query content
    if (text.includes('SELECT') && text.includes('users')) {
      return {
        rows: [
          {
            id: 'user-1',
            email: 'test@example.com',
            role: 'user',
            created_at: new Date('2023-01-01'),
          },
        ],
        rowCount: 1,
        command: 'SELECT',
        fields: [],
      };
    }

    if (text.includes('SELECT') && text.includes('projects')) {
      return {
        rows: [
          {
            id: 'project-1',
            name: 'Test Project',
            status: 'active',
            owner_id: 'user-1',
            created_at: new Date('2023-01-01'),
          },
        ],
        rowCount: 1,
        command: 'SELECT',
        fields: [],
      };
    }

    if (text.includes('INSERT')) {
      return {
        rows: [
          {
            id: 'new-id-' + Math.random().toString(36).substr(2, 9),
            ...params,
          },
        ],
        rowCount: 1,
        command: 'INSERT',
        fields: [],
      };
    }

    if (text.includes('UPDATE')) {
      return {
        rows: [],
        rowCount: 1,
        command: 'UPDATE',
        fields: [],
      };
    }

    if (text.includes('DELETE')) {
      return {
        rows: [],
        rowCount: 1,
        command: 'DELETE',
        fields: [],
      };
    }

    // Performance/KPI queries
    if (text.includes('planned_value') || text.includes('earned_value')) {
      return {
        rows: [
          {
            planned_value: 100000,
            earned_value: 80000,
            actual_cost: 85000,
            scheduled_duration: 30,
            actual_duration: 25,
          },
        ],
        rowCount: 1,
        command: 'SELECT',
        fields: [],
      };
    }

    // Default response
    return {
      rows: [],
      rowCount: 0,
      command: 'SELECT',
      fields: [],
    };
  }

  async end() {
    return Promise.resolve();
  }

  on(event, listener) {
    // Mock event listener
    return this;
  }

  removeListener(event, listener) {
    return this;
  }
}

// Mock Client class
class MockClient {
  constructor() {
    this.database = 'mock_db';
    this.user = 'mock_user';
    this.port = 5432;
    this.host = 'localhost';
  }

  async query(text, params) {
    return new MockPool().query(text, params);
  }

  async release() {
    return Promise.resolve();
  }

  async end() {
    return Promise.resolve();
  }

  on(event, listener) {
    return this;
  }

  removeListener(event, listener) {
    return this;
  }
}

// Mock types
const types = {
  setTypeParser: jest.fn(),
  getTypeParser: jest.fn(),
  builtins: {
    INT8: 20,
    INT4: 23,
    INT2: 21,
    NUMERIC: 1700,
    FLOAT8: 701,
    FLOAT4: 700,
    BOOL: 16,
    DATE: 1082,
    TIME: 1083,
    TIMESTAMP: 1114,
    TIMESTAMPTZ: 1184,
    TEXT: 25,
    VARCHAR: 1043,
    JSON: 114,
    JSONB: 3802,
  },
};

const pg = {
  Pool: MockPool,
  Client: MockClient,
  types,
};

export default pg;
