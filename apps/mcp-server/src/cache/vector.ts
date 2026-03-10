import { Pool } from 'pg';

// Database component variables (NEW APPROACH)
const DATABASE_HOST = process.env.DATABASE_HOST || 'localhost';
const DATABASE_PORT = process.env.DATABASE_PORT || '5432';
const DATABASE_NAME = process.env.DATABASE_NAME || 'mcp';
const DATABASE_USER = process.env.DATABASE_USER || 'postgres';
const DB_PASSWORD = process.env.DB_PASSWORD || '';

// Build connection URL from components
const DATABASE_URL = `postgresql://${DATABASE_USER}:${DB_PASSWORD}@${DATABASE_HOST}:${DATABASE_PORT}/${DATABASE_NAME}`;
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';

const pool = new Pool({ connectionString: DATABASE_URL });

async function ensureTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vector_cache (
      id TEXT PRIMARY KEY,
      vector FLOAT8[]
    );
  `);
}

export interface VectorEntry {
  id: string;
  vector: number[];
}

export const cacheVector = async ({
  id,
  vector,
}: VectorEntry): Promise<void> => {
  await ensureTable();
  await pool.query(
    `INSERT INTO vector_cache (id, vector) VALUES ($1, $2)
     ON CONFLICT (id) DO UPDATE SET vector = EXCLUDED.vector`,
    [id, vector]
  );

  const { default: fetch } = await import('node-fetch');
  await fetch(`${QDRANT_URL}/collections/vector_cache/points`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points: [{ id, vector }] }),
  });
};

export const getVector = async (id: string): Promise<VectorEntry | null> => {
  await ensureTable();
  const res = await pool.query(
    'SELECT id, vector FROM vector_cache WHERE id=$1',
    [id]
  );
  return res.rows[0] || null;
};

export const searchSimilar = async (
  vector: number[],
  limit = 5
): Promise<unknown> => {
  const { default: fetch } = await import('node-fetch');
  const res = await fetch(
    `${QDRANT_URL}/collections/vector_cache/points/search`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vector, limit }),
    }
  );
  return res.json();
};

export const deleteVector = async (id: string): Promise<void> => {
  await pool.query('DELETE FROM vector_cache WHERE id=$1', [id]);
  const { default: fetch } = await import('node-fetch');
  await fetch(`${QDRANT_URL}/collections/vector_cache/points/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points: [id] }),
  });
};
