import Redis from 'ioredis';
import { Pool } from 'pg';

describe('AuthService placeholder', () => {
  let db;
  let redis;

  beforeAll(() => {
    db = new Pool();
    redis = new Redis();
  });

  afterAll(async () => {
    await db.end();
    redis.disconnect();
  });

  test('placeholder passes', () => {
    expect(true).toBe(true);
  });
});
