/**
 * Resilient Module Loader
 * Handles third-party module initialization failures gracefully
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

// For compatibility with CommonJS modules in ESM environment
const nodeRequire = createRequire(import.meta.url);

export class ModuleLoader {
  private static logger = console; // Use Logger when available

  /**
   * PDF-Parse workaround
   * This module has a known bug requiring test file on initialization
   */
  static ensurePdfParseCompatibility() {
    const testDir = path.join(process.cwd(), 'test', 'data');
    const testFile = path.join(testDir, '05-versions-space.pdf');
    
    if (!fs.existsSync(testFile)) {
      fs.mkdirSync(testDir, { recursive: true });
      
      // Create minimal valid PDF (PDF 1.4 spec compliant)
      const minimalPDF = Buffer.from([
        0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34, // %PDF-1.4
        0x0A, 0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A, // Binary marker
        0x31, 0x20, 0x30, 0x20, 0x6F, 0x62, 0x6A, 0x0A, // 1 0 obj
        0x3C, 0x3C, 0x2F, 0x54, 0x79, 0x70, 0x65, 0x2F, // <</Type/
        0x43, 0x61, 0x74, 0x61, 0x6C, 0x6F, 0x67, 0x2F, // Catalog/
        0x50, 0x61, 0x67, 0x65, 0x73, 0x20, 0x32, 0x20, // Pages 2 
        0x30, 0x20, 0x52, 0x3E, 0x3E, 0x0A, 0x65, 0x6E, // 0 R>>.en
        0x64, 0x6F, 0x62, 0x6A, 0x0A, 0x32, 0x20, 0x30, // dobj.2 0
        0x20, 0x6F, 0x62, 0x6A, 0x0A, 0x3C, 0x3C, 0x2F, //  obj.<</
        0x54, 0x79, 0x70, 0x65, 0x2F, 0x50, 0x61, 0x67, // Type/Pag
        0x65, 0x73, 0x2F, 0x4B, 0x69, 0x64, 0x73, 0x5B, // es/Kids[
        0x33, 0x20, 0x30, 0x20, 0x52, 0x5D, 0x2F, 0x43, // 3 0 R]/C
        0x6F, 0x75, 0x6E, 0x74, 0x20, 0x31, 0x3E, 0x3E, // ount 1>>
        0x0A, 0x65, 0x6E, 0x64, 0x6F, 0x62, 0x6A, 0x0A, // .endobj.
        0x78, 0x72, 0x65, 0x66, 0x0A, 0x30, 0x20, 0x34, // xref.0 4
        0x0A, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, // .0000000
        0x30, 0x30, 0x30, 0x20, 0x36, 0x35, 0x35, 0x33, // 000 6553
        0x35, 0x20, 0x66, 0x20, 0x0A, 0x74, 0x72, 0x61, // 5 f .tra
        0x69, 0x6C, 0x65, 0x72, 0x0A, 0x3C, 0x3C, 0x2F, // iler.<</
        0x53, 0x69, 0x7A, 0x65, 0x20, 0x34, 0x2F, 0x52, // Size 4/R
        0x6F, 0x6F, 0x74, 0x20, 0x31, 0x20, 0x30, 0x20, // oot 1 0 
        0x52, 0x3E, 0x3E, 0x0A, 0x73, 0x74, 0x61, 0x72, // R>>.star
        0x74, 0x78, 0x72, 0x65, 0x66, 0x0A, 0x31, 0x30, // txref.10
        0x39, 0x0A, 0x25, 0x25, 0x45, 0x4F, 0x46, 0x0A // 9.%%EOF.
      ]);
      
      fs.writeFileSync(testFile, minimalPDF as Uint8Array);
      this.logger.info('Created PDF compatibility file');
    }
  }

  /**
   * Safe dynamic import with fallback
   */
  static async safeImport<T>(moduleName: string, fallback?: T): Promise<T> {
    try {
      const module = await import(moduleName);
      return module.default || module;
    } catch (error) {
      this.logger.error(`Failed to load module ${moduleName}:`, error);
      if (fallback !== undefined) {
        this.logger.info(`Using fallback for ${moduleName}`);
        return fallback;
      }
      throw error;
    }
  }

  /**
   * Safe require with fallback for CommonJS modules (legacy compatibility)
   * @deprecated Use safeImport for ESM modules instead
   */
  static async safeRequireLegacy<T>(moduleName: string, fallback?: T): Promise<T> {
    try {
      // Try ESM import first
      const module = await import(moduleName);
      return module.default || module;
    } catch (esimportError) {
      try {
        // Fallback to CommonJS for legacy modules using top-level require
        return nodeRequire(moduleName);
      } catch (requireError) {
        this.logger.error(`Failed to load module ${moduleName}:`, requireError);
        if (fallback !== undefined) {
          this.logger.info(`Using fallback for ${moduleName}`);
          return fallback;
        }
        throw requireError;
      }
    }
  }

  /**
   * Initialize multiple modules with error handling
   */
  static async initializeModules(modules: Record<string, () => Promise<any>>): Promise<Record<string, any>> {
    const results: Record<string, any> = {};
    const failures: string[] = [];

    for (const [name, loader] of Object.entries(modules)) {
      try {
        results[name] = await loader();
        this.logger.info(`Successfully loaded module: ${name}`);
      } catch (error) {
        this.logger.error(`Failed to load module ${name}:`, error);
        failures.push(name);
        results[name] = null;
      }
    }

    if (failures.length > 0) {
      this.logger.warn(`Failed to load ${failures.length} modules: ${failures.join(', ')}`);
    }

    return results;
  }

  /**
   * Check if module is available without loading it
   */
  static async isModuleAvailable(moduleName: string): Promise<boolean> {
    try {
      // Try ESM import resolution first
      await import.meta.resolve(moduleName);
      return true;
    } catch {
      try {
        // Try dynamic import as backup validation
        await import(moduleName);
        return true;
      } catch {
        return false;
      }
    }
  }

  /**
   * Load optional dependencies with graceful degradation
   */
  static async loadOptionalDependencies(dependencies: string[]): Promise<Record<string, boolean>> {
    const availability: Record<string, boolean> = {};
    
    for (const dep of dependencies) {
      availability[dep] = await this.isModuleAvailable(dep);
      if (!availability[dep]) {
        this.logger.warn(`Optional dependency ${dep} is not available - some features may be disabled`);
      }
    }
    
    return availability;
  }
}

// Initialize PDF compatibility on module load
try {
  ModuleLoader.ensurePdfParseCompatibility();
} catch (error) {
}