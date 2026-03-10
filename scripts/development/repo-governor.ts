import { promises as fs } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

/**
 * RepoGovernor provides read-only insights into repository documentation
 * and is intended to be extended with validation logic.
 */
export class RepoGovernor {
  constructor(private readonly rootDir: string = process.cwd()) {}

  /** List markdown files under docs/architecture for quick discovery */
  async listArchitectureDocs(): Promise<string[]> {
    const archDir = path.join(this.rootDir, 'docs', 'architecture');
    const entries = await fs.readdir(archDir);
    return entries.filter((e) => e.endsWith('.md')).sort();
  }

  /**
   * Read the contents of a documentation file under the docs/ tree.
   * `relativePath` must be relative to the docs directory to prevent
   * directory traversal.
   */
  async readDoc(relativePath: string): Promise<string> {
    const docsDir = path.join(this.rootDir, 'docs');
    const fullPath = path.resolve(docsDir, relativePath);
    if (!fullPath.startsWith(docsDir)) {
      throw new Error('invalid documentation path');
    }
    return fs.readFile(fullPath, 'utf8');
  }

  /**
   * Validate that all tracked tsconfig files enforce strict settings.
   * Returns an array of files that violate the policy with issue summaries.
   */
  async validateTsConfigs(): Promise<
    Array<{ file: string; issues: string[] }>
  > {
    const files = execSync('git ls-files', { encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter((f) => /tsconfig.*\.json$/.test(f));

    const problems: Array<{ file: string; issues: string[] }> = [];
    await Promise.all(
      files.map(async (f) => {
        try {
          const json = JSON.parse(
            await fs.readFile(path.join(this.rootDir, f), 'utf8')
          );
          const issues: string[] = [];
          const options = json.compilerOptions ?? {};
          if (options.strict !== true) issues.push('strict must be true');
          if (options.skipLibCheck !== false)
            issues.push('skipLibCheck must be false');
          if (issues.length) problems.push({ file: f, issues });
        } catch {
          problems.push({ file: f, issues: ['unable to parse JSON'] });
        }
      })
    );

    return problems.sort((a, b) => a.file.localeCompare(b.file));
  }

  /**
   * Scan tracked JavaScript files for CommonJS usage to aid ESM migration.
   * Returns any `.cjs` modules or `.js` files containing `require` or
   * `module.exports` patterns.
   */
  async detectCommonJs(): Promise<Array<{ file: string; issues: string[] }>> {
    const files = execSync('git ls-files', { encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter((f) => f.endsWith('.js') || f.endsWith('.cjs'));

    const problems: Array<{ file: string; issues: string[] }> = [];
    await Promise.all(
      files.map(async (f) => {
        const issues: string[] = [];
        if (f.endsWith('.cjs')) {
          issues.push('CommonJS module');
        } else {
          try {
            const src = await fs.readFile(path.join(this.rootDir, f), 'utf8');
            if (/\brequire\(/.test(src)) issues.push('uses require');
            if (/module\.exports/.test(src)) issues.push('uses module.exports');
          } catch {
            issues.push('unable to read file');
          }
        }
        if (issues.length) problems.push({ file: f, issues });
      })
    );

    return problems.sort((a, b) => a.file.localeCompare(b.file));
  }
}

export async function main(): Promise<void> {
  const governor = new RepoGovernor();
  const [docs, tsIssues, commonJs] = await Promise.all([
    governor.listArchitectureDocs(),
    governor.validateTsConfigs(),
    governor.detectCommonJs(),
  ]);
  console.log(
    JSON.stringify(
      {
        architectureDocs: docs,
        tsconfigIssues: tsIssues,
        commonJsModules: commonJs,
      },
      null,
      2
    )
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
