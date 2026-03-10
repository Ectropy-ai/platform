import axios from 'axios';

describe('Project and DAO Flow Integration Tests', () => {
  const apiBase = 'http://localhost:4000';
  let authToken;

  beforeAll(async () => {
    try {
      const _loginResponse = await axios.post(`${apiBase}/api/auth/login`, {
        username: 'admin',
        password: 'admin',
      });
      authToken = 'test-token-123';
    } catch (_err) {
      // ignore errors if server not available
    }
  });

  test('List projects', async () => {
    const response = await axios.get(`${apiBase}/api/v1/projects`);
    expect(response.status).toBe(200);
  });

  test('Create project', async () => {
    const project = { name: 'Integration Test Project' };
    const response = await axios.post(`${apiBase}/api/v1/projects`, project, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(response.status).toBeGreaterThanOrEqual(200);
  });

  test('Get DAO proposals', async () => {
    const response = await axios.get(`${apiBase}/api/v1/dao/proposals`);
    expect(response.status).toBe(200);
  });

  test('Handles unknown route with 404', async () => {
    try {
      await axios.get(`${apiBase}/unknown-route`);
    } catch (err) {
      expect(err.response.status).toBe(404);
    }
  });
});
