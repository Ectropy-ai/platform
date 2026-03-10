import axios from 'axios';

describe('Manufacturer Endpoints', () => {
  const apiBase = 'http://localhost:4000';

  test('List manufacturer categories', async () => {
    const response = await axios.get(
      `${apiBase}/api/v1/manufacturer/categories`
    );
    expect(response.status).toBe(200);
  });

  test('Search manufacturer products', async () => {
    const response = await axios.get(
      `${apiBase}/api/v1/manufacturer/products/search`,
      { params: { q: 'test' } }
    );
    expect(response.status).toBeGreaterThanOrEqual(200);
  });
});
