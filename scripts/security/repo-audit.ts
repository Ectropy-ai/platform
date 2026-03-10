import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import ts from 'typescript';

function run(cmd: string): string[] {
  try {
    return execSync(cmd, { encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(Boolean);
  } catch {
    return [];
  }
}

// Exclude generated or transient directories but include tests for analysis
const ignorePatterns = [/^archive\//, /^tmp\//];
const files = run('git ls-files').filter(
  (f) => !ignorePatterns.some((p) => p.test(f))
);
const cjsFiles = files.filter((f) => f.endsWith('.cjs'));
const jsFiles = files.filter((f) => f.endsWith('.js'));
const tsconfigFiles = files.filter((f) => /tsconfig.*\.json$/.test(f));

const commonJsPatterns = jsFiles.filter((f) => {
  const src = readFileSync(f, 'utf8');
  return src.includes('module.exports') || /\brequire\(/.test(src);
});

function readJson(f: string): any {
  const raw = readFileSync(f, 'utf8');
  return ts.parseConfigFileTextToJson(f, raw).config;
}

const nonStrictTsconfigs = tsconfigFiles.filter((f) => {
  try {
    const json = readJson(f);
    return json.compilerOptions?.strict === false;
  } catch {
    return false;
  }
});

const skipLibCheckConfigs = tsconfigFiles.filter((f) => {
  try {
    const json = readJson(f);
    return json.compilerOptions?.skipLibCheck === true;
  } catch {
    return false;
  }
});

console.log('CommonJS module files (.cjs):');
cjsFiles.forEach((f) => console.log(` - ${f}`));
console.log(`Total: ${cjsFiles.length}`);

console.log('\nJS files using CommonJS patterns:');
commonJsPatterns.forEach((f) => console.log(` - ${f}`));
console.log(`Total: ${commonJsPatterns.length}`);

console.log('\nNon-strict TypeScript configs:');
nonStrictTsconfigs.forEach((f) => console.log(` - ${f}`));
console.log(`Total: ${nonStrictTsconfigs.length}`);

console.log('\nTypeScript configs with skipLibCheck true:');
skipLibCheckConfigs.forEach((f) => console.log(` - ${f}`));
console.log(`Total: ${skipLibCheckConfigs.length}`);

const report = {
  cjsFiles,
  commonJsFiles: commonJsPatterns,
  nonStrictTsconfigs,
  skipLibCheckConfigs,
  counts: {
    cjsFiles: cjsFiles.length,
    commonJsFiles: commonJsPatterns.length,
    nonStrictTsconfigs: nonStrictTsconfigs.length,
    skipLibCheckConfigs: skipLibCheckConfigs.length,
  },
};

mkdirSync('reports', { recursive: true });
writeFileSync(
  'reports/repo-audit-report.json',
  JSON.stringify(report, null, 2) + '\n'
);
