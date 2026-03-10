import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

interface DependencyUpdate {
  name: string;
  currentVersion: string;
  latestVersion: string;
  updateType: 'major' | 'minor' | 'patch';
  securityIssues: boolean;
}

class SmartDependencyUpdater {
  private workspaceRoot: string;
  private packageJson: any;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.packageJson = JSON.parse(
      readFileSync(join(workspaceRoot, 'package.json'), 'utf-8')
    );
  }

  async checkUpdates(): Promise<DependencyUpdate[]> {
    const updates: DependencyUpdate[] = [];

    try {
      // Use pnpm to check for updates
      const result = execSync('pnpm outdated --format json', {
        cwd: this.workspaceRoot,
        encoding: 'utf-8',
      });

      const outdated = JSON.parse(result);

      for (const [name, info] of Object.entries(outdated)) {
        const updateInfo = info as any;
        updates.push({
          name,
          currentVersion: updateInfo.current,
          latestVersion: updateInfo.latest,
          updateType: this.determineUpdateType(
            updateInfo.current,
            updateInfo.latest
          ),
          securityIssues: await this.checkSecurityIssues(name),
        });
      }
    } catch (error) {
      console.log('No outdated packages found or pnpm outdated failed');
    }

    return updates;
  }

  async applySecurityUpdates(): Promise<void> {
    console.log('Applying security updates...');

    try {
      execSync('pnpm audit fix', { cwd: this.workspaceRoot });
      console.log('Security updates applied successfully');
    } catch (error) {
      console.error('Failed to apply security updates:', error);
    }
  }

  async updatePatchVersions(): Promise<void> {
    console.log('Updating patch versions...');

    try {
      execSync('pnpm update --latest --filter "*.patch"', {
        cwd: this.workspaceRoot,
      });
      console.log('Patch updates applied successfully');
    } catch (error) {
      console.error('Failed to apply patch updates:', error);
    }
  }

  private determineUpdateType(
    current: string,
    latest: string
  ): 'major' | 'minor' | 'patch' {
    const currentParts = current.split('.');
    const latestParts = latest.split('.');

    if (currentParts[0] !== latestParts[0]) return 'major';
    if (currentParts[1] !== latestParts[1]) return 'minor';
    return 'patch';
  }

  private async checkSecurityIssues(packageName: string): Promise<boolean> {
    try {
      const result = execSync(`pnpm audit --filter ${packageName} --json`, {
        cwd: this.workspaceRoot,
        encoding: 'utf-8',
      });

      const auditResult = JSON.parse(result);
      return (
        auditResult.vulnerabilities &&
        Object.keys(auditResult.vulnerabilities).length > 0
      );
    } catch {
      return false;
    }
  }
}

// CLI interface for AI agents
async function main() {
  const updater = new SmartDependencyUpdater(process.cwd());

  const command = process.argv[2];

  switch (command) {
    case 'check':
      const updates = await updater.checkUpdates();
      console.log(JSON.stringify(updates, null, 2));
      break;

    case 'security':
      await updater.applySecurityUpdates();
      break;

    case 'patch':
      await updater.updatePatchVersions();
      break;

    default:
      console.log('Usage: npm run deps:manage [check|security|patch]');
  }
}

if (require.main === module) {
  main().catch(console.error);
}
