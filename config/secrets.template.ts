/**
 * =============================================================================
 * ECTROPY PLATFORM - SECURE SECRETS TEMPLATE
 * 
 * PURPOSE: Template configuration for secrets management
 * SECURITY: ALL values MUST use environment variables - NO hardcoded secrets
 * USAGE: Copy to secrets.local.ts and configure environment variables
 * =============================================================================
 */

export interface SecretsConfig {
  monitoring: {
    apiKey: string;
    endpoint: string;
    encryptionKey: string;
  };
  logging: {
    encryptionKey: string;
    auditEndpoint: string;
  };
  auth: {
    jwtSecret: string;
    jwtRefreshSecret: string;
    sessionSecret: string;
  };
  database: {
    url: string;
    username: string;
    password: string;
  };
  redis: {
    url: string;
    password: string;
  };
  external: {
    speckleToken: string;
    openaiApiKey: string;
    githubToken: string;
  };
}

// Template - copy to secrets.local.ts and add real environment variables
export const secrets: SecretsConfig = {
  monitoring: {
    apiKey: process.env.MONITORING_API_KEY || '',
    endpoint: process.env.MONITORING_ENDPOINT || '',
    encryptionKey: process.env.MONITORING_ENCRYPTION_KEY || '',
  },
  logging: {
    encryptionKey: process.env.LOG_ENCRYPTION_KEY || '',
    auditEndpoint: process.env.AUDIT_LOG_ENDPOINT || '',
  },
  auth: {
    jwtSecret: process.env.JWT_SECRET || '',
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || '',
    sessionSecret: process.env.SESSION_SECRET || '',
  },
  database: {
    url: process.env.DATABASE_URL || '',
    username: process.env.DATABASE_USER || '',
    password: process.env.DATABASE_PASSWORD || '',
  },
  redis: {
    url: process.env.REDIS_URL || '',
    password: process.env.REDIS_PASSWORD || '',
  },
  external: {
    speckleToken: process.env.SPECKLE_TOKEN || '',
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    githubToken: process.env.GITHUB_TOKEN || '',
  },
};

// Validation function to ensure all required secrets are configured
export function validateSecrets(): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  
  // Check critical secrets
  if (!secrets.auth.jwtSecret) missing.push('JWT_SECRET');
  if (!secrets.auth.sessionSecret) missing.push('SESSION_SECRET');
  if (!secrets.database.url) missing.push('DATABASE_URL');
  
  // Check monitoring secrets in production
  if (process.env.NODE_ENV === 'production') {
    if (!secrets.monitoring.apiKey) missing.push('MONITORING_API_KEY');
    if (!secrets.logging.encryptionKey) missing.push('LOG_ENCRYPTION_KEY');
  }
  
  return {
    valid: missing.length === 0,
    missing,
  };
}

// Export for use in applications
export default secrets;