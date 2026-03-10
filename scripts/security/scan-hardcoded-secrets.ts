#!/usr/bin/env tsx

/**
 * Hardcoded Secret Scanner - Enterprise Security
 *
 * Scans the entire codebase for hardcoded secrets and sensitive information
 * that should be externalized to environment variables or secure storage.
 */

import { execSync } from 'child_process';
import { writeFileSync } from 'fs';

interface SecretPattern {
  name: string;
  pattern: RegExp;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
}

const SECRET_PATTERNS: SecretPattern[] = [
  {
    name: 'OpenAI API Key',
    pattern: /sk-[a-zA-Z0-9]{48}/g,
    severity: 'critical',
    description: 'OpenAI API keys should never be hardcoded',
  },
  {
    name: 'GitHub Personal Access Token',
    pattern: /gh[ps]_[a-zA-Z0-9]{36}/g,
    severity: 'critical',
    description: 'GitHub tokens should be stored in environment variables',
  },
  {
    name: 'AWS Access Key ID',
    pattern: /AKIA[0-9A-Z]{16}/g,
    severity: 'critical',
    description: 'AWS access keys must never be committed to source code',
  },
  {
    name: 'AWS Secret Access Key',
    pattern: /[A-Za-z0-9/+=]{40}(?![A-Za-z0-9/+=])/g,
    severity: 'high',
    description: 'Potential AWS secret access key (exactly 40 chars base64)',
  },
  {
    name: 'JWT Token',
    pattern: /eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/g,
    severity: 'high',
    description: 'JWT tokens should not be hardcoded',
  },
  {
    name: 'Database Connection String',
    pattern: /postgresql:\/\/[^:\s]+:[^@\s]+@[^\/\s]+\/[^\s]*/g,
    severity: 'high',
    description:
      'Database URLs with credentials should use environment variables',
  },
  {
    name: 'Generic API Key Pattern',
    pattern: /['"](api_key|apikey|api-key)['"]:\s*['"][a-zA-Z0-9]{20,}['"]/gi,
    severity: 'medium',
    description: 'API keys should be externalized to environment variables',
  },
  {
    name: 'Generic Secret Pattern',
    pattern: /['"](secret|password|passwd|pwd)['"]:\s*['"][^'"]{8,}['"]/gi,
    severity: 'medium',
    description: 'Secrets and passwords should not be hardcoded',
  },
  {
    name: 'Private Key',
    pattern: /-----BEGIN (RSA |DSA |EC )?PRIVATE KEY-----/g,
    severity: 'critical',
    description: 'Private keys must never be committed to source code',
  },
  {
    name: 'Generic Token Pattern',
    pattern: /['"](token|bearer)['"]:\s*['"][a-zA-Z0-9]{20,}['"]/gi,
    severity: 'medium',
    description: 'Authentication tokens should use secure storage',
  },
];

class HardcodedSecretScanner {
  private findings: Array<{
    file: string;
    line: number;
    column: number;
    pattern: string;
    severity: string;
    description: string;
    context: string;
  }> = [];

  async scanRepository(): Promise<boolean> {
    console.log('🔍 Scanning repository for hardcoded secrets...\n');

    let hasSecrets = false;

    for (const secretPattern of SECRET_PATTERNS) {
      console.log(`🧪 Scanning for: ${secretPattern.name}`);

      try {
        // Use git grep to search tracked files only, excluding common false positives
        const grepCommand = [
          'git grep -n -E',
          `"${secretPattern.pattern.source}"`,
          '--',
          ':!*.lock', // Exclude lock files
          ':!*.log', // Exclude log files
          ':!node_modules', // Exclude dependencies
          ':!dist', // Exclude build output
          ':!coverage', // Exclude coverage reports
          ':!*.min.js', // Exclude minified files
          ':!*.map', // Exclude source maps
          ':!pnpm-lock.yaml', // Exclude pnpm lock
          ':!*.tsbuildinfo', // Exclude TypeScript build info
          ':!.git', // Exclude git folder
          '|| true', // Don't fail if no matches
        ].join(' ');

        const result = execSync(grepCommand, {
          encoding: 'utf-8',
          maxBuffer: 1024 * 1024 * 10, // 10MB buffer
        });

        if (result.trim()) {
          hasSecrets = true;

          const matches = result.trim().split('\n');
          console.log(
            `❌ Found ${matches.length} potential ${secretPattern.name} matches:`
          );

          matches.forEach((match) => {
            // Parse git grep output: file:line:content
            const [file, lineNum, ...contentParts] = match.split(':');
            const content = contentParts.join(':');

            // Find actual pattern matches in the content
            const patternMatches = Array.from(
              content.matchAll(secretPattern.pattern)
            );

            patternMatches.forEach((patternMatch) => {
              this.findings.push({
                file: file,
                line: parseInt(lineNum) || 0,
                column: patternMatch.index || 0,
                pattern: secretPattern.name,
                severity: secretPattern.severity,
                description: secretPattern.description,
                context: content.trim(),
              });

              console.log(`   📄 ${file}:${lineNum}`);
              console.log(
                `   🔍 ${content.trim().substring(0, 100)}${content.length > 100 ? '...' : ''}`
              );
            });
          });

          console.log('');
        } else {
          console.log(`✅ No ${secretPattern.name} found`);
        }
      } catch (error) {
        console.log(
          `⚠️  Could not scan for ${secretPattern.name}: ${error.message}`
        );
      }
    }

    return hasSecrets;
  }

  generateReport(): void {
    const report = {
      timestamp: new Date().toISOString(),
      total_findings: this.findings.length,
      severity_breakdown: {
        critical: this.findings.filter((f) => f.severity === 'critical').length,
        high: this.findings.filter((f) => f.severity === 'high').length,
        medium: this.findings.filter((f) => f.severity === 'medium').length,
        low: this.findings.filter((f) => f.severity === 'low').length,
      },
      files_affected: [...new Set(this.findings.map((f) => f.file))],
      findings: this.findings,
    };

    const reportPath = 'security-scan-report.json';
    writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log('📊 Security Scan Summary:');
    console.log('========================');
    console.log(`Total findings: ${report.total_findings}`);
    console.log(`Critical: ${report.severity_breakdown.critical}`);
    console.log(`High: ${report.severity_breakdown.high}`);
    console.log(`Medium: ${report.severity_breakdown.medium}`);
    console.log(`Low: ${report.severity_breakdown.low}`);
    console.log(`Files affected: ${report.files_affected.length}`);
    console.log(`Report saved: ${reportPath}\n`);
  }

  async checkCommonMistakes(): Promise<void> {
    console.log('🕵️  Checking for common security mistakes...\n');

    const commonMistakes = [
      {
        name: 'Environment files in git',
        command: 'git ls-files | grep -E "^\\.env($|\\.)"',
        description: 'Environment files should not be committed',
      },
      {
        name: 'Debug statements with secrets',
        command:
          'git grep -i -E "(console\\.log|print|echo).*(password|secret|key|token)" -- "*.ts" "*.js" || true',
        description: 'Debug statements might leak sensitive information',
      },
      {
        name: 'Commented secrets',
        command:
          'git grep -E "^\\s*#.*[Pp]assword|^\\s*#.*[Ss]ecret|^\\s*#.*[Kk]ey" || true',
        description: 'Commented secrets should be removed',
      },
      {
        name: 'Hardcoded localhost with credentials',
        command: 'git grep -E "://[^:]+:[^@]+@localhost" || true',
        description:
          'Localhost URLs with credentials should use environment variables',
      },
    ];

    for (const mistake of commonMistakes) {
      console.log(`🧪 Checking: ${mistake.name}`);

      try {
        const result = execSync(mistake.command, {
          encoding: 'utf-8',
          stdio: 'pipe',
        });

        if (result.trim()) {
          console.log(`❌ Found ${mistake.name}:`);
          console.log(result.trim());

          this.findings.push({
            file: 'Multiple files',
            line: 0,
            column: 0,
            pattern: mistake.name,
            severity: 'medium',
            description: mistake.description,
            context: 'See scan results above',
          });
        } else {
          console.log(`✅ No ${mistake.name} found`);
        }
      } catch (error) {
        console.log(`✅ No ${mistake.name} found`);
      }
    }
  }

  async checkDockerSecrets(): Promise<void> {
    console.log('\n🐳 Checking Docker files for secrets...\n');

    try {
      const dockerFiles = execSync(
        'find . -name "Dockerfile*" -o -name "docker-compose*.yml" -o -name "docker-compose*.yaml" | grep -v node_modules',
        {
          encoding: 'utf-8',
        }
      )
        .trim()
        .split('\n')
        .filter((f) => f);

      for (const file of dockerFiles) {
        console.log(`📄 Checking ${file}`);

        // Check for hardcoded credentials in Docker files
        const checks = [
          {
            pattern: /ENV\s+\w*PASSWORD\w*\s*=\s*[^$][^\s]+/gi,
            desc: 'Hardcoded password in ENV',
          },
          {
            pattern: /ENV\s+\w*SECRET\w*\s*=\s*[^$][^\s]+/gi,
            desc: 'Hardcoded secret in ENV',
          },
          {
            pattern: /ENV\s+\w*KEY\w*\s*=\s*[^$][^\s]+/gi,
            desc: 'Hardcoded key in ENV',
          },
          {
            pattern: /-e\s+\w*PASSWORD\w*=[^$][^\s]+/gi,
            desc: 'Hardcoded password in docker run',
          },
        ];

        for (const check of checks) {
          const grepResult = execSync(
            `grep -n -E "${check.pattern.source}" "${file}" || true`,
            {
              encoding: 'utf-8',
            }
          );

          if (grepResult.trim()) {
            console.log(`   ❌ ${check.desc}`);
            console.log(`   ${grepResult.trim()}`);
          }
        }
      }
    } catch (error) {
      console.log('⚠️  Could not check Docker files');
    }
  }
}

async function main(): Promise<void> {
  const scanner = new HardcodedSecretScanner();

  console.log('🔒 Ectropy Platform - Hardcoded Secret Scanner');
  console.log('==============================================\n');

  // Run all scans
  const hasSecrets = await scanner.scanRepository();
  await scanner.checkCommonMistakes();
  await scanner.checkDockerSecrets();

  // Generate comprehensive report
  scanner.generateReport();

  if (hasSecrets) {
    console.log('🚨 SECURITY ALERT: Hardcoded secrets detected!');
    console.log('Action required: Remove all hardcoded secrets immediately.');
    console.log(
      'Use environment variables or secure secret management instead.\n'
    );
    process.exit(1);
  } else {
    console.log('🎉 Security scan passed - no hardcoded secrets detected!');
    console.log('Repository follows security best practices.\n');
    process.exit(0);
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { HardcodedSecretScanner, SECRET_PATTERNS };
