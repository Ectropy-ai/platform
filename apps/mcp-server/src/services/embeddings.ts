import { OpenAI } from 'openai';

export class EmbeddingsService {
  private client: OpenAI | null = null;

  constructor() {
    if (process.env.OPENAI_API_KEY) {
      try {
        this.client = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY,
        });
      } catch (error) {
        console.error(
          '⚠️  Failed to initialize OpenAI embeddings service:',
          error
        );
        this.client = null;
      }
    } else {
      console.log(
        'ℹ️  OpenAI API key not provided, embeddings service disabled'
      );
    }
  }

  async generate(text: string): Promise<number[]> {
    if (!this.client) {
      // Return mock embedding vector for development
      return Array.from({ length: 1536 }, () => Math.random() - 0.5);
    }

    try {
      const response = await this.client.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
      });
      return response.data[0].embedding;
    } catch (error) {
      // Return mock embedding vector as fallback
      return Array.from({ length: 1536 }, () => Math.random() - 0.5);
    }
  }

  isAvailable(): boolean {
    return this.client !== null;
  }
}

export const embeddings = new EmbeddingsService();
