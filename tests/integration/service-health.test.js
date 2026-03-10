import axios from 'axios';

describe('Service Health Integration Tests', () => {
  const services = {
    apiGateway: 'http://localhost:4000',
    speckleServer: 'http://localhost:3000',
    frontend: 'http://localhost:3002',
  };

  test('API Gateway Health Check', async () => {
    const response = await axios.get(`${services.apiGateway}/health`);
    expect(response.status).toBe(200);
    expect(response.data.status).toBe('healthy');
  });

  test('Speckle Server GraphQL', async () => {
    const query = { query: '{ serverInfo { name, version } }' };
    const response = await axios.post(
      `${services.speckleServer}/graphql`,
      query
    );
    expect(response.status).toBe(200);
    expect(response.data.data.serverInfo.name).toBe('Speckle Server');
  });

  test('Frontend Accessibility', async () => {
    const response = await axios.get(services.frontend);
    expect(response.status).toBe(200);
  });

  test('Database Connectivity', async () => {
    const response = await axios.get(`${services.apiGateway}/api/v1/projects`);
    expect(response.status).toBe(200);
  });
});
