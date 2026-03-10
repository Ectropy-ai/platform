#!/usr/bin/env node
/**
 * Ectropy Secret Management Demo
 * Demonstrates the enterprise secret management system capabilities
 */

import { readFileSync, existsSync } from 'fs';

const colors = {
  blue: (text: string) => `\x1b[34m${text}\x1b[0m`,
  green: (text: string) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text: string) => `\x1b[33m${text}\x1b[0m`,
  red: (text: string) => `\x1b[31m${text}\x1b[0m`,
  bold: (text: string) => `\x1b[1m${text}\x1b[0m`,
  reset: '\x1b[0m'
};

console.log(colors.blue('🎯 Ectropy Platform - Secret Management Demo'));
console.log(colors.blue('===============================================\n'));

console.log(colors.bold('🔐 Enterprise Secret Management System'));
console.log('✅ Secure GitHub Secrets integration');
console.log('✅ Local development environment setup');
console.log('✅ OpenAI API key validation and testing');
console.log('✅ Automated CI/CD secret validation');
console.log('✅ Hardcoded secret prevention');

console.log('\n' + colors.bold('📋 Available Commands:'));
console.log(colors.green('npm run setup:dev') + '       - Complete development setup');
console.log(colors.green('npm run secrets:sync') + '     - Sync from GitHub Secrets');
console.log(colors.green('npm run secrets:validate') + ' - Validate secret configuration');
console.log(colors.green('npm run secrets:generate') + ' - Generate production template');

console.log('\n' + colors.bold('🔍 Current Configuration Status:'));

if (existsSync('.env.local')) {
  console.log(colors.green('✅ .env.local exists'));
  
  const envContent = readFileSync('.env.local', 'utf8');
  
  // Check for key configurations
  const checks = [
    { name: 'OpenAI API Key', pattern: /OPENAI_API_KEY=sk-/, configured: envContent.includes('OPENAI_API_KEY=sk-') },
    { name: 'JWT Secret', pattern: /JWT_SECRET=/, configured: envContent.includes('JWT_SECRET=') && !envContent.includes('JWT_SECRET=') },
    { name: 'Database URL', pattern: /DATABASE_URL=postgresql:/, configured: envContent.includes('DATABASE_URL=postgresql:') },
    { name: 'Redis Configuration', pattern: /REDIS_URL=redis:/, configured: envContent.includes('REDIS_URL=redis:') },
  ];
  
  checks.forEach(check => {
    if (check.configured) {
      console.log(colors.green(`  ✅ ${check.name}`));
    } else {
      console.log(colors.yellow(`  ⚠️  ${check.name} - needs configuration`));
    }
  });
  
} else {
  console.log(colors.red('❌ .env.local not found'));
  console.log(colors.yellow('   Run: npm run setup:dev'));
}

console.log('\n' + colors.bold('🚀 Quick Start:'));
console.log('1. ' + colors.blue('npm run setup:dev') + ' - Sets up local environment');
console.log('2. Add your OpenAI API key to .env.local');  
console.log('3. ' + colors.blue('npm run docker:start') + ' - Start local services');
console.log('4. ' + colors.blue('npm run dev') + ' - Start development servers');

console.log('\n' + colors.bold('🔐 Security Features:'));
console.log('• Format validation for API keys');
console.log('• Connection testing before startup');
console.log('• Hardcoded secret prevention');
console.log('• CI/CD automated validation');
console.log('• Production readiness checks');

console.log('\n' + colors.bold('📖 Documentation:'));
console.log('• GitHub Workflow: .github/workflows/secret-validation.yml');
console.log('• Setup Scripts: scripts/setup-dev-env.ts');
console.log('• Sync Scripts: scripts/sync-secrets.ts');
console.log('• Security Docs: docs/security/SECRETS_MANAGEMENT.md');

if (existsSync('.env.local')) {
  console.log('\n' + colors.green('🎉 Secret management system is active!'));
  console.log(colors.blue('Ready to distribute OpenAI API keys to enable AI features.'));
} else {
  console.log('\n' + colors.yellow('⚠️  Run npm run setup:dev to get started'));
}

console.log('\n' + colors.blue('For support: Contact repository administrator'));
console.log('=' + '='.repeat(45));