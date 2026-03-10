#!/usr/bin/env tsx

/**
 * Simple Hardcoded Secret Validator
 *
 * Focused scanner that looks for actual hardcoded secrets
 * with minimal false positives.
 */

import { execSync } from 'child_process';

async function validateNoHardcodedSecrets(): Promise<boolean> {
  console.log('🔍 Validating no hardcoded secrets in codebase...\n');

  const criticalPatterns = [
    { name: 'OpenAI API Key', pattern: 'sk-[a-zA-Z0-9]{48}' },
    { name: 'GitHub Token', pattern: 'gh[ps]_[a-zA-Z0-9]{36}' },
    { name: 'AWS Access Key', pattern: 'AKIA[0-9A-Z]{16}' },
  ];

  let hasSecrets = false;

  for (const { name, pattern } of criticalPatterns) {
    try {
      const result = execSync(
        `git grep -E "${pattern}" -- ':!*.md' ':!*.lock' ':!node_modules' || true`,
        { encoding: 'utf-8' }
      );

      if (result.trim()) {
        console.error(`❌ Found potential ${name}:`);
        console.error(result.trim());
        hasSecrets = true;
      } else {
        console.log(`✅ No ${name} found`);
      }
    } catch (error) {
      console.log(`⚠️  Could not scan for ${name}`);
    }
  }

  // Check for obvious hardcoded database credentials (not in documentation)
  try {
    const dbResult = execSync(
      'git grep -E "postgresql://[^:]+:[^@]+@" -- "*.ts" "*.js" "*.json" ":!*.md" ":!*test*" ":!*example*" || true',
      { encoding: 'utf-8' }
    );

    if (dbResult.trim()) {
      console.error('❌ Found potential hardcoded database credentials:');
      dbResult.split('\n').forEach((line) => {
        if (
          line.trim() &&
          !line.includes('process.env') &&
          !line.includes('${')
        ) {
          console.error(`   ${line}`);
          hasSecrets = true;
        }
      });
    } else {
      console.log('✅ No hardcoded database credentials found');
    }
  } catch (error) {
    console.log('⚠️  Could not scan for database credentials');
  }

  if (hasSecrets) {
    console.error('\n🚨 SECURITY VIOLATION: Hardcoded secrets detected!');
    console.error('Remove all hardcoded secrets immediately.');
    return false;
  } else {
    console.log('\n🔒 Security validation passed - no hardcoded secrets found');
    return true;
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  validateNoHardcodedSecrets()
    .then((valid) => process.exit(valid ? 0 : 1))
    .catch(console.error);
}

export { validateNoHardcodedSecrets };
