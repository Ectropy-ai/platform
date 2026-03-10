import { execSync } from 'child_process';
import fs from 'fs/promises';

type RootCause =
  | 'missing-dependencies'
  | 'jsx-configuration'
  | 'typescript-config'
  | 'unknown';

export interface Diagnosis {
  rootCause: RootCause;
}

export interface Fix {
  description: string;
  command: string;
  automated: boolean;
  action?: () => Promise<void>;
}

export interface BuildHealthReport {
  app: string;
  errors: string[];
  rootCause: RootCause;
  fixes: Fix[];
  autoFixable: boolean;
}

export class BuildDoctor {
  async diagnose(app: string): Promise<BuildHealthReport> {
    const errors = await this.captureErrors(app);
    const diagnosis = await this.analyzeErrors(errors);
    const prescription = await this.generateFixes(diagnosis);

    return {
      app,
      errors: errors.slice(0, 3),
      rootCause: diagnosis.rootCause,
      fixes: prescription,
      autoFixable: prescription.some((fix) => fix.automated),
    };
  }

  private async captureErrors(app: string): Promise<string[]> {
    try {
      execSync(`pnpm nx run ${app}:build`, { encoding: 'utf8', stdio: 'pipe' });
      return [];
    } catch (error) {
      let output = '';

      if (typeof error === 'string') {
        output = error;
      } else if (error && typeof error === 'object') {
        const errorObj = error as {
          stdout?: string;
          stderr?: string;
          message?: string;
        };
        output = errorObj.stdout || errorObj.stderr || errorObj.message || '';
      }

      return output
        .split('\n')
        .filter((line) => /error/i.test(line))
        .slice(0, 10);
    }
  }

  private async analyzeErrors(errors: string[]): Promise<Diagnosis> {
    if (errors.some((error) => error.includes('Cannot find module'))) {
      return { rootCause: 'missing-dependencies' };
    }

    if (errors.some((error) => error.includes('JSX'))) {
      return { rootCause: 'jsx-configuration' };
    }

    if (errors.some((error) => error.toLowerCase().includes('tsconfig'))) {
      return { rootCause: 'typescript-config' };
    }

    return { rootCause: 'unknown' };
  }

  private async generateFixes(diagnosis: Diagnosis): Promise<Fix[]> {
    const fixes: Fix[] = [];

    switch (diagnosis.rootCause) {
      case 'missing-dependencies':
        fixes.push({
          description: 'Install missing React dependencies',
          command: 'pnpm add react react-dom @types/react @types/react-dom',
          automated: true,
        });
        break;

      case 'jsx-configuration':
        fixes.push({
          description: 'Fix JSX configuration in tsconfig',
          command: 'Update tsconfig.app.json with jsx: "react-jsx"',
          automated: true,
          action: async () => {
            const config = {
              extends: '../../tsconfig.base.json',
              compilerOptions: {
                jsx: 'react-jsx',
                module: 'ESNext',
                target: 'ES2022',
                lib: ['ES2022', 'DOM'],
                outDir: '../../dist/apps/web-dashboard',
              },
              include: ['src/**/*'],
              exclude: ['**/*.spec.ts', '**/*.test.ts'],
            };

            await fs.writeFile(
              'apps/web-dashboard/tsconfig.app.json',
              `${JSON.stringify(config, null, 2)}\n`,
              'utf8'
            );
          },
        });
        break;

      case 'typescript-config':
        fixes.push({
          description:
            'Review TypeScript configuration for build compatibility',
          command:
            'Check tsconfig paths and compiler options for the failing app',
          automated: false,
        });
        break;

      default:
        fixes.push({
          description: 'Investigate build logs for additional details',
          command: 'Review build output and consider running with --verbose',
          automated: false,
        });
        break;
    }

    return fixes;
  }
}
