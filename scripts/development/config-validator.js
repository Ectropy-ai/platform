/**
 * Configuration Validator
 * Ensures all required environment variables are set for production
 */

const requiredVars = {
  core: ['NODE_ENV', 'LOG_LEVEL', 'SERVICE_NAME'],
  database: [
    'DATABASE_HOST',
    'DATABASE_PORT',
    'DATABASE_NAME',
    'DATABASE_USER',
    'DATABASE_PASSWORD',
  ],
  redis: ['REDIS_HOST', 'REDIS_PORT'],
  security: ['JWT_SECRET', 'SESSION_SECRET'],
  services: ['API_GATEWAY_URL', 'MCP_SERVER_URL', 'WEB_DASHBOARD_URL'],
};

const optionalVars = {
  monitoring: ['DATADOG_API_KEY', 'SENTRY_DSN', 'PROMETHEUS_ENABLED'],
  ai: ['OPENAI_API_KEY', 'OPENAI_ORG_ID'],
  bim: ['SPECKLE_SERVER_URL', 'SPECKLE_API_TOKEN'],
  features: ['ENABLE_MCP_AGENTS', 'ENABLE_WEBSOCKETS', 'ENABLE_CACHE'],
};

async function validateConfig() {
  const errors = [];
  const warnings = [];

  console.log('🔍 Validating Ectropy Platform Configuration...');
  console.log('==================================================');

  // Check required variables
  for (const [category, vars] of Object.entries(requiredVars)) {
    console.log(`\n📋 Checking ${category} configuration...`);

    for (const varName of vars) {
      if (!process.env[varName]) {
        if (category === 'security') {
          errors.push(`CRITICAL: Missing ${varName} - security vulnerability`);
          console.log(
            `❌ CRITICAL: ${varName} is missing (security vulnerability)`
          );
        } else {
          errors.push(`Missing required ${category} variable: ${varName}`);
          console.log(`❌ Missing required variable: ${varName}`);
        }
      } else {
        console.log(`✅ ${varName} is set`);
      }
    }
  }

  // Check optional variables
  for (const [category, vars] of Object.entries(optionalVars)) {
    console.log(`\n🔧 Checking optional ${category} configuration...`);

    for (const varName of vars) {
      if (!process.env[varName]) {
        warnings.push(`Optional ${category} variable not set: ${varName}`);
        console.log(
          `⚠️  Optional: ${varName} not set (${category} features may be limited)`
        );
      } else {
        console.log(`✅ ${varName} is configured`);
      }
    }
  }

  // Check for development values in production
  if (process.env.NODE_ENV === 'production') {
    console.log('\n🔒 Checking production security...');

    if (
      process.env.JWT_SECRET?.includes('development') ||
      process.env.JWT_SECRET?.length < 32
    ) {
      errors.push(
        'CRITICAL: Weak or development JWT_SECRET detected in production'
      );
      console.log(
        '❌ CRITICAL: JWT_SECRET is weak or contains development values'
      );
    } else if (process.env.JWT_SECRET) {
      console.log('✅ JWT_SECRET meets security requirements');
    }

    if (
      process.env.DATABASE_PASSWORD === 'postgres' ||
      process.env.DATABASE_PASSWORD === 'password'
    ) {
      errors.push('CRITICAL: Default database password in production');
      console.log('❌ CRITICAL: Using default database password');
    } else if (process.env.DATABASE_PASSWORD) {
      console.log('✅ Database password appears secure');
    }

    if (process.env.SESSION_SECRET?.length < 32) {
      errors.push('CRITICAL: SESSION_SECRET too short for production');
      console.log('❌ CRITICAL: SESSION_SECRET is too short');
    } else if (process.env.SESSION_SECRET) {
      console.log('✅ SESSION_SECRET meets security requirements');
    }
  }

  // Check service endpoints
  console.log('\n🌐 Checking service endpoints...');
  if (process.env.API_GATEWAY_URL?.includes('localhost')) {
    warnings.push('API_GATEWAY_URL points to localhost');
    console.log('⚠️  API_GATEWAY_URL uses localhost (development mode?)');
  } else if (process.env.API_GATEWAY_URL) {
    console.log('✅ API_GATEWAY_URL configured for external access');
  }

  // Performance checks
  console.log('\n⚡ Checking performance configuration...');
  const maxMemory = parseInt(process.env.MAX_MEMORY_MB || '0');
  if (maxMemory > 0 && maxMemory < 512) {
    warnings.push(
      'MAX_MEMORY_MB is set below 512MB - may cause performance issues'
    );
    console.log('⚠️  MAX_MEMORY_MB is below recommended 512MB');
  } else if (maxMemory >= 512) {
    console.log('✅ Memory allocation is adequate');
  }

  // Database connection string validation
  if (process.env.DATABASE_URL) {
    console.log('\n🗄️  Validating database connection...');
    try {
      const url = new URL(process.env.DATABASE_URL);
      if (url.protocol !== 'postgresql:') {
        warnings.push('DATABASE_URL protocol is not postgresql://');
        console.log('⚠️  DATABASE_URL protocol should be postgresql://');
      } else {
        console.log('✅ Database URL format is valid');
      }
    } catch (error) {
      errors.push('DATABASE_URL format is invalid');
      console.log('❌ DATABASE_URL format is invalid');
    }
  }

  // Generate summary
  console.log('\n📊 CONFIGURATION VALIDATION SUMMARY');
  console.log('=====================================');

  if (errors.length > 0) {
    console.log(`❌ ${errors.length} Critical Error(s):`);
    errors.forEach((e) => console.log(`   • ${e}`));
    console.log('\n🚨 CONFIGURATION INVALID - DO NOT DEPLOY');
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.log(`⚠️  ${warnings.length} Warning(s):`);
    warnings.forEach((w) => console.log(`   • ${w}`));
  }

  console.log(
    `\n✅ Configuration validated for ${process.env.NODE_ENV || 'development'}`
  );
  console.log('🎯 Platform ready for deployment');

  // Save validation report
  const report = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    validation: {
      status: errors.length === 0 ? 'PASS' : 'FAIL',
      errors: errors.length,
      warnings: warnings.length,
      details: { errors, warnings },
    },
    configuration: {
      required: Object.values(requiredVars).flat().length,
      optional: Object.values(optionalVars).flat().length,
      configured:
        Object.values(requiredVars)
          .flat()
          .filter((v) => process.env[v]).length +
        Object.values(optionalVars)
          .flat()
          .filter((v) => process.env[v]).length,
    },
  };

  const fs = await import('fs');
  fs.writeFileSync(
    'reports/config-validation.json',
    JSON.stringify(report, null, 2)
  );

  console.log('📄 Validation report saved to reports/config-validation.json');
}

function checkSecrets() {
  console.log('\n🔐 Secret Management Validation');
  console.log('================================');

  const secretPatterns = [
    /sk-[a-zA-Z0-9]{20,}/, // OpenAI API keys
    /xoxb-[a-zA-Z0-9-]+/, // Slack bot tokens
    /ghp_[a-zA-Z0-9]{36}/, // GitHub personal access tokens
    /AIza[a-zA-Z0-9_-]{35}/, // Google API keys
  ];

  const suspiciousEnvVars = [];

  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') {
      for (const pattern of secretPatterns) {
        if (pattern.test(value)) {
          suspiciousEnvVars.push(key);
          break;
        }
      }
    }
  }

  if (suspiciousEnvVars.length > 0) {
    console.log('🚨 POTENTIAL SECRETS DETECTED IN ENVIRONMENT:');
    suspiciousEnvVars.forEach((key) => {
      console.log(`   ❌ ${key} appears to contain a secret token`);
    });
    console.log(
      '\n⚠️  Ensure secrets are managed through proper secret management systems'
    );
    console.log(
      '   - Use Azure Key Vault, AWS Secrets Manager, or HashiCorp Vault'
    );
    console.log('   - Never commit secrets to version control');
    console.log('   - Use environment variable references like ${SECRET_NAME}');
    return false;
  } else {
    console.log('✅ No obvious secrets detected in environment variables');
    return true;
  }
}

export default { validateConfig, checkSecrets };

// Run if executed directly
if (require.main === module) {
  (async () => {
    // Ensure reports directory exists
    const fs = await import('fs');
    if (!fs.existsSync('reports')) {
      fs.mkdirSync('reports', { recursive: true });
    }

    await validateConfig();
    checkSecrets();
  })();
}
