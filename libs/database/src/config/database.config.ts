/**
 * Database configuration management
 */

import { DatabaseConfig, RedisConfig } from '../types/database.types.js';
export class DatabaseConfigService {
  private static instance: DatabaseConfigService;
  private constructor() {}
  public static getInstance(): DatabaseConfigService {
    if (!DatabaseConfigService.instance) {
      DatabaseConfigService.instance = new DatabaseConfigService();
    }
    return DatabaseConfigService.instance;
  }
  public getPostgresConfig(): DatabaseConfig {
    return {
      host: process.env['DB_HOST'] || 'localhost',
      port: parseInt(process.env['DB_PORT'] || '5432', 10),
      database: process.env['DB_NAME'] || 'ectropy',
      username: process.env['DB_USER'] || 'postgres',
      password: process.env['DB_PASSWORD'] || '',
      ssl: process.env['DB_SSL'] === 'true',
      maxConnections: parseInt(process.env['DB_MAX_CONNECTIONS'] || '20', 10),
      connectionTimeoutMillis: parseInt(
        process.env['DB_CONNECTION_TIMEOUT'] || '5000',
        10
      ),
      idleTimeoutMillis: parseInt(
        process.env['DB_IDLE_TIMEOUT'] || '30000',
        10
      ),
      maxUses: parseInt(process.env['DB_MAX_USES'] || '7500', 10),
    };
  }
  public getRedisConfig(): RedisConfig {
    const config: RedisConfig = {
      host: process.env['REDIS_HOST'] || 'localhost',
      port: parseInt(process.env['REDIS_PORT'] || '6379', 10),
      db: parseInt(process.env['REDIS_DB'] || '0', 10),
      keyPrefix: process.env['REDIS_KEY_PREFIX'] || 'ectropy:',
      retryDelayOnFailover: parseInt(
        process.env['REDIS_RETRY_DELAY'] || '100',
        10
      ),
      maxRetriesPerRequest: parseInt(
        process.env['REDIS_MAX_RETRIES'] || '3',
        10
      ),
    };
    if (process.env['REDIS_PASSWORD']) {
      config.password = process.env['REDIS_PASSWORD'];
    }
    return config;
  }
  public validateConfig(config: DatabaseConfig): boolean {
    const required = ['host', 'port', 'database', 'username'];
    return required.every(
      (field) => config[field as keyof DatabaseConfig] !== undefined
    );
  }
}
