export interface Config {
  port: number;
  nodeEnv: string;
  jwtSecret: string;
  databaseUrl: string;
  logLevel: string;
}

export const config: Config = {
  port: parseInt(process.env.MCP_PORT || '3001'),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || '',
  databaseUrl: process.env.DATABASE_URL || '',
  logLevel: process.env.LOG_LEVEL || 'info',
};

export const validateConfig = (): string[] => {
  const errors: string[] = [];

  if (!config.jwtSecret && config.nodeEnv === 'production') {
    errors.push('JWT_SECRET is required in production');
  }

  if (!config.databaseUrl && config.nodeEnv === 'production') {
    errors.push('DATABASE_URL is required in production');
  }

  return errors;
};
