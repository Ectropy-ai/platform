import { pipeline } from '@xenova/transformers';
import { Pool } from 'pg';
import { QdrantClient } from '@qdrant/js-client-rest';
import * as typescript from 'typescript';

export interface EmbeddingChunk {
  id: string;
  text: string;
}

const MODEL_ID = 'sentence-transformers/all-MiniLM-L6-v2';

// Initialize database clients once per process
const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL ?? 'http://localhost:6333',
  apiKey: process.env.QDRANT_API_KEY,
});

/**
 * Break a document into semantically meaningful chunks while
 * attempting to preserve code structure for .ts and .js files.
 */
export function chunkDocument(filePath: string, content: string): EmbeddingChunk[] {
  const ext = filePath.split('.').pop();
  const chunks: EmbeddingChunk[] = [];

  if (ext === 'ts' || ext === 'js') {
    const source = typescript.createSourceFile(filePath, content, typescript.ScriptTarget.Latest, true);
    const visit = (node: typescript.Node) => {
      if (
        typescript.isFunctionDeclaration(node) ||
        typescript.isMethodDeclaration(node) ||
        typescript.isClassDeclaration(node)
      ) {
        const text = node.getText(source);
        chunks.push({
          id: `${node.pos}-${node.end}`,
          text,
        });
      }
      typescript.forEachChild(node, visit);
    };
    visit(source);
  }

  if (chunks.length === 0) {
    // Fallback: split by blank lines
    content
      .split(/\n{2,}/)
      .map((text, idx) => ({ id: `${idx}`, text: text.trim() }))
      .filter((c) => c.text)
      .forEach((c) => chunks.push(c));
  }

  return chunks;
}

/**
 * Generate embeddings for a set of files and store them in Postgres and Qdrant.
 */
export async function generateEmbeddings(files: { path: string; content: string }[]) {
  const embed = await pipeline('feature-extraction', MODEL_ID);

  for (const file of files) {
    const chunks = chunkDocument(file.path, file.content);
    for (const chunk of chunks) {
      const output: any = await embed(chunk.text, { pooling: 'mean', normalize: true });
      const vector = Array.from(output.data as Float32Array);

      // Store in Postgres
      await pgPool.query(
        'INSERT INTO embeddings(path, chunk_id, content, vector) VALUES ($1,$2,$3,$4) ON CONFLICT (path, chunk_id) DO UPDATE SET content=EXCLUDED.content, vector=EXCLUDED.vector',
        [file.path, chunk.id, chunk.text, vector]
      );

      // Store in Qdrant
      await qdrant.upsert('embeddings', {
        wait: true,
        points: [
          {
            id: `${file.path}:${chunk.id}`,
            vector,
            payload: { path: file.path, chunkId: chunk.id, content: chunk.text },
          },
        ],
      });
    }
  }
}
