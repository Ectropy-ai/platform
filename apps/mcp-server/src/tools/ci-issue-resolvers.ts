// TypeScript Error Fixer for MCP Server
export class TypeScriptErrorFixer {
  
  async fixTypescriptErrors(params: { errors: string[], projectPath: string }): Promise<{ fixes: string[], script: string }> {
    const fixes: string[] = [];
    const scriptLines: string[] = [
      '#!/bin/bash',
      'set -e',
      'echo "🔧 Fixing TypeScript errors..."',
      ''
    ];

    for (const error of params.errors) {
      const fix = await this.analyzeTypescriptError(error);
      if (fix) {
        fixes.push(fix.description);
        scriptLines.push(fix.command);
      }
    }

    scriptLines.push('echo "✅ TypeScript fixes applied"');
    
    return {
      fixes,
      script: scriptLines.join('\n')
    };
  }

  private async analyzeTypescriptError(error: string): Promise<{ description: string, command: string } | null> {
    // Common TypeScript error patterns and fixes
    
    if (error.includes("Cannot find type definition file for 'node'")) {
      return {
        description: "Fix missing @types/node dependency",
        command: 'pnpm add -D @types/node@latest'
      };
    }
    
    if (error.includes("Module not found") && error.includes("@ectropy/")) {
      return {
        description: "Fix missing internal module references",
        command: 'pnpm nx build --skip-nx-cache'
      };
    }
    
    if (error.includes("Property") && error.includes("does not exist on type")) {
      return {
        description: "Fix property access errors",
        command: 'echo "# Manual fix required for property access"'
      };
    }
    
    if (error.includes("Element implicitly has an 'any' type")) {
      return {
        description: "Fix implicit any type errors",
        command: 'echo "# Consider adding explicit type annotations"'
      };
    }
    
    if (error.includes("Cannot resolve dependency")) {
      return {
        description: "Fix dependency resolution",
        command: 'pnpm install --force'
      };
    }

    return null;
  }
}

// Dependency Resolver for MCP Server  
export class DependencyResolver {
  
  async resolveDependencies(params: { missingPackages: string[], projectPath: string }): Promise<{ fixes: string[], script: string }> {
    const fixes: string[] = [];
    const scriptLines: string[] = [
      '#!/bin/bash',
      'set -e',
      'echo "📦 Resolving missing dependencies..."',
      ''
    ];

    for (const pkg of params.missingPackages) {
      const fix = this.resolveMissingPackage(pkg);
      fixes.push(fix.description);
      scriptLines.push(fix.command);
    }

    scriptLines.push('echo "✅ Dependencies resolved"');
    
    return {
      fixes,
      script: scriptLines.join('\n')
    };
  }

  private resolveMissingPackage(packageName: string): { description: string, command: string } {
    // Map common missing packages to their correct installations
    const packageMap: Record<string, string> = {
      'jest': 'pnpm add -D jest@latest',
      'typescript': 'pnpm add -D typescript@latest',
      'eslint': 'pnpm add -D eslint@latest',
      '@types/node': 'pnpm add -D @types/node@latest',
      '@types/jest': 'pnpm add -D @types/jest@latest',
      'webpack': 'pnpm add -D webpack@latest',
      'ts-node': 'pnpm add -D ts-node@latest',
      'playwright': 'pnpm add -D @playwright/test@latest',
    };

    const installCommand = packageMap[packageName] || `pnpm add ${packageName}`;
    
    return {
      description: `Install missing package: ${packageName}`,
      command: installCommand
    };
  }
}

// Security Issue Fixer for MCP Server
export class SecurityIssueFixer {
  
  async fixSecurityIssues(params: { vulnerabilities: any[], projectPath: string }): Promise<{ fixes: string[], script: string }> {
    const fixes: string[] = [];
    const scriptLines: string[] = [
      '#!/bin/bash',
      'set -e',
      'echo "🔒 Fixing security vulnerabilities..."',
      ''
    ];

    for (const vuln of params.vulnerabilities) {
      const fix = this.resolveSecurityVulnerability(vuln);
      fixes.push(fix.description);
      scriptLines.push(fix.command);
    }

    scriptLines.push('echo "✅ Security issues resolved"');
    
    return {
      fixes,
      script: scriptLines.join('\n')
    };
  }

  private resolveSecurityVulnerability(vulnerability: any): { description: string, command: string } {
    if (vulnerability.severity === 'high' || vulnerability.severity === 'critical') {
      return {
        description: `Fix critical vulnerability in ${vulnerability.moduleName}`,
        command: `pnpm audit fix --force`
      };
    }
    
    return {
      description: `Update vulnerable package: ${vulnerability.moduleName}`,
      command: `pnpm update ${vulnerability.moduleName}`
    };
  }
}