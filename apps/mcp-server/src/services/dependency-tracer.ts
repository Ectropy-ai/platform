/**
 * Dependency Tracer Service
 * Maps import chains and identifies missing or circular dependencies
 */

import fs from 'fs/promises';
import path from 'path';

export interface ImportChain {
  file: string;
  imports: string[]; // Direct imports
  resolvedPaths: Map<string, string>; // Import -> actual file path
  missingDependencies: string[];
  circularDependencies: string[];
}

export interface DependencyAnalysis {
  targetFile: string;
  importChain: ImportChain;
  buildOrder: string[]; // Correct build sequence
  blockedBy: string[]; // Dependencies not yet built
}

export class DependencyTracer {
  private rootPath: string;
  private tsConfigPaths: Record<string, string[]>;
  private visited: Set<string> = new Set();

  constructor(rootPath: string = process.cwd()) {
    this.rootPath = rootPath;
    this.tsConfigPaths = {};
  }

  /**
   * Load TypeScript path mappings from tsconfig.base.json
   */
  async loadPathMappings(): Promise<void> {
    try {
      const tsconfigPath = path.join(this.rootPath, 'tsconfig.base.json');
      const content = await fs.readFile(tsconfigPath, 'utf-8');
      const tsconfig = JSON.parse(content);
      
      if (tsconfig.compilerOptions && tsconfig.compilerOptions.paths) {
        this.tsConfigPaths = tsconfig.compilerOptions.paths;
      }
    } catch (error) {
      console.warn('Could not load tsconfig.base.json:', error);
    }
  }

  /**
   * Trace dependencies for a given file
   */
  async trace(targetFile: string): Promise<DependencyAnalysis> {
    // Reset visited set for each trace
    this.visited = new Set();

    // Ensure path mappings are loaded
    if (Object.keys(this.tsConfigPaths).length === 0) {
      await this.loadPathMappings();
    }

    const absolutePath = path.isAbsolute(targetFile) 
      ? targetFile 
      : path.join(this.rootPath, targetFile);

    const importChain = await this.analyzeFile(absolutePath);
    
    // Determine build order based on dependency graph
    const buildOrder = await this.determineBuildOrder(importChain);
    
    // Check which dependencies are not yet built
    const blockedBy = await this.findBlockingDependencies(importChain);

    return {
      targetFile: absolutePath,
      importChain,
      buildOrder,
      blockedBy,
    };
  }

  /**
   * Analyze a single file and extract its imports
   */
  private async analyzeFile(filePath: string): Promise<ImportChain> {
    const imports: string[] = [];
    const resolvedPaths = new Map<string, string>();
    const missingDependencies: string[] = [];
    const circularDependencies: string[] = [];

    try {
      // Check if file exists
      const exists = await this.fileExists(filePath);
      if (!exists) {
        missingDependencies.push(filePath);
        return {
          file: filePath,
          imports,
          resolvedPaths,
          missingDependencies,
          circularDependencies,
        };
      }

      const content = await fs.readFile(filePath, 'utf-8');
      
      // Extract import statements
      const importRegex = /import\s+(?:(?:[\w*\s{},]*)\s+from\s+)?['"]([^'"]+)['"]/g;
      let match;
      
      while ((match = importRegex.exec(content)) !== null) {
        const importPath = match[1];
        imports.push(importPath);

        // Try to resolve the import path
        const resolved = await this.resolveImport(importPath, filePath);
        
        if (resolved) {
          resolvedPaths.set(importPath, resolved);
          
          // Check for circular dependencies
          if (this.visited.has(resolved)) {
            circularDependencies.push(importPath);
          }
        } else {
          missingDependencies.push(importPath);
        }
      }

      // Mark this file as visited for circular dependency detection
      this.visited.add(filePath);

    } catch (error) {
      console.warn(`Error analyzing file ${filePath}:`, error);
    }

    return {
      file: filePath,
      imports,
      resolvedPaths,
      missingDependencies,
      circularDependencies,
    };
  }

  /**
   * Resolve an import path to an actual file path
   */
  private async resolveImport(importPath: string, fromFile: string): Promise<string | null> {
    // Handle relative imports
    if (importPath.startsWith('.')) {
      const dir = path.dirname(fromFile);
      const resolved = path.resolve(dir, importPath);
      
      // Try with .ts, .tsx, .js extensions
      for (const ext of ['.ts', '.tsx', '.js', '/index.ts', '/index.js']) {
        const withExt = resolved + ext;
        if (await this.fileExists(withExt)) {
          return withExt;
        }
      }
      return null;
    }

    // Handle node_modules imports
    if (!importPath.startsWith('@ectropy/') && !importPath.startsWith('@')) {
      // Check if it exists in node_modules
      const nodeModulesPath = path.join(this.rootPath, 'node_modules', importPath);
      if (await this.fileExists(nodeModulesPath)) {
        return nodeModulesPath;
      }
      // Assume it exists (external dependency)
      return `node_modules/${importPath}`;
    }

    // Handle path-mapped imports (@ectropy/*)
    for (const [pattern, mappings] of Object.entries(this.tsConfigPaths)) {
      const patternRegex = new RegExp(
        `^${ pattern.replace('*', '(.*)') }$`
      );
      const match = importPath.match(patternRegex);
      
      if (match) {
        for (const mapping of mappings) {
          const resolvedPattern = mapping.replace('*', match[1] || '');
          const fullPath = path.join(this.rootPath, resolvedPattern);
          
          // Try with extensions
          for (const ext of ['', '.ts', '.tsx', '.js', '/index.ts']) {
            const withExt = fullPath + ext;
            if (await this.fileExists(withExt)) {
              return withExt;
            }
          }

          // Check if it's a directory with an index file
          if (await this.isDirectory(fullPath)) {
            const indexPath = path.join(fullPath, 'index.ts');
            if (await this.fileExists(indexPath)) {
              return indexPath;
            }
          }

          // Check dist folder for built output
          const distPath = fullPath.replace('/src/', '/dist/');
          if (await this.fileExists(distPath)) {
            return distPath;
          }
        }
      }
    }

    return null;
  }

  /**
   * Determine the correct build order based on dependencies
   */
  private async determineBuildOrder(importChain: ImportChain): Promise<string[]> {
    const buildOrder: string[] = [];
    const { resolvedPaths } = importChain;

    // Extract library names from resolved paths
    for (const [importPath, resolvedPath] of resolvedPaths.entries()) {
      if (importPath.startsWith('@ectropy/')) {
        // Extract library name from path
        const libMatch = resolvedPath.match(/libs\/([^/]+)/);
        if (libMatch) {
          const libName = libMatch[1];
          if (!buildOrder.includes(libName)) {
            buildOrder.push(libName);
          }
        }
      }
    }

    return buildOrder;
  }

  /**
   * Find dependencies that are blocking the build
   */
  private async findBlockingDependencies(importChain: ImportChain): Promise<string[]> {
    const blockedBy: string[] = [];

    for (const dep of importChain.missingDependencies) {
      if (dep.startsWith('@ectropy/')) {
        blockedBy.push(dep);
      }
    }

    return blockedBy;
  }

  /**
   * Check if a file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if a path is a directory
   */
  private async isDirectory(filePath: string): Promise<boolean> {
    try {
      const stats = await fs.stat(filePath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }
}
