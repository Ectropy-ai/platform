import { RepoGovernor } from '../scripts/repo-governor';

describe('RepoGovernor', () => {
  it('lists architecture docs', async () => {
    const governor = new RepoGovernor();
    const docs = await governor.listArchitectureDocs();
    expect(docs).toContain('CURRENT_ARCHITECTURE.md');
  });

  it('detects TypeScript config policy violations', async () => {
    const governor = new RepoGovernor();
    const issues = await governor.validateTsConfigs();
    const base = issues.find((i) => i.file === 'tsconfig.base.json');
    expect(base?.issues).toContain('strict must be true');
  });

  it('flags CommonJS modules for ESM migration', async () => {
    const governor = new RepoGovernor();
    const issues = await governor.detectCommonJs();
    expect(issues.some((i) => i.file.endsWith('.cjs'))).toBe(false);
  });

  it('reads documentation content', async () => {
    const governor = new RepoGovernor();
    const content = await governor.readDoc(
      'architecture/CURRENT_ARCHITECTURE.md'
    );
    expect(content).toMatch(/Ectropy Platform/);
  });
});
