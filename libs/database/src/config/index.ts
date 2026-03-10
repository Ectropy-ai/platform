/**
 * Database Configuration Service
 * Provides configuration management for database connections
 */

export interface DatabaseConfig {
  postgres: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    ssl?: boolean | { rejectUnauthorized: boolean };
  };
  redis: {
    host: string;
    port: number;
    password?: string;
    connectTimeout?: number;
  };
}

export class DatabaseConfigService {
  private config: DatabaseConfig;

  constructor() {
    this.config = this.loadConfiguration();
  }

  private loadConfiguration(): DatabaseConfig {
    return {
      postgres: {
        host: process.env.DATABASE_HOST || 'localhost',
        port: parseInt(process.env.DATABASE_PORT || '5432'),
        database: process.env.DATABASE_NAME || 'ectropy',
        user: process.env.DATABASE_USER || '',
        password: process.env.DATABASE_PASSWORD || '',
        ssl: process.env.NODE_ENV === 'production' 
          ? { rejectUnauthorized: false } 
          : false
      },
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        connectTimeout: parseInt(process.env.REDIS_TIMEOUT || '10000')
      }
    };
  }

  public getPostgresConfig() {
    return this.config.postgres;
  }

  public getRedisConfig() {
    return this.config.redis;
  }

  public getDatabaseUrl(): string {
    const { host, port, database, user, password } = this.config.postgres;
    return `postgresql://${user}:${password}@${host}:${port}/${database}`;
  }

  public getRedisUrl(): string {
    const { host, port, password } = this.config.redis;
    const auth = password ? `:${password}@` : '';
    return `redis://${auth}${host}:${port}/0`;
  }
}

export function getDatabaseConfig(): DatabaseConfig {
  const service = new DatabaseConfigService();
  return {
    postgres: service.getPostgresConfig(),
    redis: service.getRedisConfig()
  };
}

// Export the config type as default for compatibility
export type { DatabaseConfig as Config };