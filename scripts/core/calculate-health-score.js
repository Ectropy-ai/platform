#!/usr/bin/env node

/**
 * Health Score Calculator for Ectropy Platform
 * Calculates overall system health score based on various factors
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

const calculateHealthScore = async () => {
  let score = 100;
  const factors = [];

  try {
    // Test 1: Basic build functionality (20 points)
    try {
      execSync('pnpm nx run mcp-server:build --dry-run', { stdio: 'pipe', cwd: projectRoot });
      factors.push({ name: 'Build System', score: 20, status: 'pass' });
    } catch (e) {
      score -= 20;
      factors.push({ name: 'Build System', score: 0, status: 'fail' });
    }

    // Test 2: Package integrity (15 points)
    try {
      const packageJsonPath = join(projectRoot, 'package.json');
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
      if (packageJson.name && packageJson.version) {
        factors.push({ name: 'Package Integrity', score: 15, status: 'pass' });
      } else {
        score -= 15;
        factors.push({ name: 'Package Integrity', score: 0, status: 'fail' });
      }
    } catch (e) {
      score -= 15;
      factors.push({ name: 'Package Integrity', score: 0, status: 'fail' });
    }

    // Test 3: TypeScript configuration (15 points)
    try {
      const tsconfigExists = existsSync(join(projectRoot, 'tsconfig.json'));
      if (tsconfigExists) {
        factors.push({ name: 'TypeScript Config', score: 15, status: 'pass' });
      } else {
        score -= 15;
        factors.push({ name: 'TypeScript Config', score: 0, status: 'fail' });
      }
    } catch (e) {
      score -= 15;
      factors.push({ name: 'TypeScript Config', score: 0, status: 'fail' });
    }

    // Test 4: Security configuration (25 points)
    try {
      const securityFiles = [
        '.secretlintrc.json',
        '.gitleaks.toml'
      ].every(file => existsSync(join(projectRoot, file)));
      
      if (securityFiles) {
        factors.push({ name: 'Security Config', score: 25, status: 'pass' });
      } else {
        score -= 25;
        factors.push({ name: 'Security Config', score: 0, status: 'fail' });
      }
    } catch (e) {
      score -= 25;
      factors.push({ name: 'Security Config', score: 0, status: 'fail' });
    }

    // Test 5: Workflow configuration (25 points)
    try {
      const workflowFiles = [
        '.github/workflows/foundation.yml',
        '.github/workflows/production-gates.yml'
      ].every(file => existsSync(join(projectRoot, file)));
      
      if (workflowFiles) {
        factors.push({ name: 'CI/CD Workflows', score: 25, status: 'pass' });
      } else {
        score -= 25;
        factors.push({ name: 'CI/CD Workflows', score: 0, status: 'fail' });
      }
    } catch (e) {
      score -= 25;
      factors.push({ name: 'CI/CD Workflows', score: 0, status: 'fail' });
    }

    // Ensure score doesn't go below 0
    score = Math.max(0, score);

    // Output results
    console.log('\n🏥 Ectropy Platform Health Score');
    console.log('================================');
    console.log(`Overall Score: ${score}/100`);
    console.log('\nFactor Breakdown:');
    factors.forEach(factor => {
      const status = factor.status === 'pass' ? '✅' : '❌';
      console.log(`  ${status} ${factor.name}: ${factor.score}`);
    });
    console.log('\nHealth Score:', score);

    // Exit with appropriate code
    if (score >= 95) {
      console.log('🎉 System is production ready!');
      process.exit(0);
    } else if (score >= 80) {
      console.log('⚠️ System needs attention but is functional');
      process.exit(0);
    } else {
      console.log('🚨 System requires immediate attention');
      process.exit(1);
    }

  } catch (error) {
    console.error('Error calculating health score:', error);
    process.exit(1);
  }
};

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  calculateHealthScore();
}

export { calculateHealthScore };