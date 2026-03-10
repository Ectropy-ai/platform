import 'ts-node/register';
import express from 'express';
import request from 'supertest';
import createIFCRoutes from '../../apps/api-gateway/src/routes/ifc.routes';

describe('IFC Routes', () => {
  const db = { query: jest.fn() };
  let app;

  beforeEach(() => {
    app = express();
    app.use('/ifc', createIFCRoutes(db));
  });

  test('GET /ifc/supported-types returns list', async () => {
    const res = await request(app).get('/ifc/supported-types');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('supportedTypes');
    expect(Array.isArray(res.body.supportedTypes)).toBe(true);
  });

  test('GET /ifc/health returns status', async () => {
    const res = await request(app).get('/ifc/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'healthy');
  });
});
