/**
 * Build Analyzer Service
 * Parses and categorizes TypeScript build errors from NX build output
 */

export interface BuildError {
  file: string;
  line: number;
  column: number;
  code: string; // TS2307, TS2339, etc.
  message: string;
  category: 'module-resolution' | 'type-error' | 'syntax' | 'config';
  severity: 'error' | 'warning';
}

export interface BuildAnalysis {
  app: string;
  success: boolean;
  errors: BuildError[];
  duration: number;
  timestamp: string;
}

export class BuildAnalyzer {
  /**
   * Parse build output and extract structured error information
   */
  parse(buildOutput: string, appName: string = 'unknown'): BuildAnalysis {
    const startTime = Date.now();
    const errors: BuildError[] = [];

    // Split output into lines and process each
    const lines = buildOutput.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Match TypeScript error pattern: path/to/file.ts(line,column): error TSxxxx: message
      const errorMatch = line.match(/^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s*(.+)$/);
      
      if (errorMatch) {
        const [, file, lineNum, column, severity, code, message] = errorMatch;
        
        errors.push({
          file: file.trim(),
          line: parseInt(lineNum, 10),
          column: parseInt(column, 10),
          code,
          message: message.trim(),
          category: this.categorizeError(code, message),
          severity: severity as 'error' | 'warning',
        });
      } else {
        // Alternative pattern: file.ts:line:column - error TSxxxx: message
        const altMatch = line.match(/^(.+?):(\d+):(\d+)\s*-\s*(error|warning)\s+(TS\d+):\s*(.+)$/);
        
        if (altMatch) {
          const [, file, lineNum, column, severity, code, message] = altMatch;
          
          errors.push({
            file: file.trim(),
            line: parseInt(lineNum, 10),
            column: parseInt(column, 10),
            code,
            message: message.trim(),
            category: this.categorizeError(code, message),
            severity: severity as 'error' | 'warning',
          });
        } else {
          // Pattern for errors without file location: error TSxxxx: message
          const noFileMatch = line.match(/^\s*(error|warning)\s+(TS\d+):\s*(.+)$/);
          
          if (noFileMatch) {
            const [, severity, code, message] = noFileMatch;
            
            errors.push({
              file: '',
              line: 0,
              column: 0,
              code,
              message: message.trim(),
              category: this.categorizeError(code, message),
              severity: severity as 'error' | 'warning',
            });
          }
        }
      }
    }

    const duration = Date.now() - startTime;
    const success = errors.filter(e => e.severity === 'error').length === 0;

    return {
      app: appName,
      success,
      errors,
      duration,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Categorize error by TS error code and message content
   */
  private categorizeError(code: string, message: string): BuildError['category'] {
    // Module resolution errors
    if (code === 'TS2307' || message.includes('Cannot find module')) {
      return 'module-resolution';
    }
    
    // Type errors - property access, type mismatches
    if (
      code === 'TS2339' || // Property does not exist
      code === 'TS2345' || // Argument type not assignable
      code === 'TS2322' || // Type not assignable
      code === 'TS2304' || // Cannot find name
      code === 'TS2551' || // Property does not exist (with typo suggestion)
      message.includes('Property') ||
      message.includes('does not exist') ||
      message.includes('not assignable')
    ) {
      return 'type-error';
    }
    
    // Configuration errors
    if (
      code === 'TS5023' || // Unknown compiler option
      code === 'TS5024' || // Compiler option expects an argument
      code === 'TS5025' || // Unknown compiler option
      code === 'TS6053' || // File not found
      message.toLowerCase().includes('tsconfig') ||
      message.includes('compiler option')
    ) {
      return 'config';
    }
    
    // Syntax errors
    if (
      code === 'TS1005' || // Expected token
      code === 'TS1109' || // Expression expected
      code === 'TS1128' || // Declaration or statement expected
      code === 'TS2304' || // Cannot find name (could also be type error)
      message.includes('expected') ||
      message.includes('Unexpected token')
    ) {
      return 'syntax';
    }
    
    // Default to type-error for unmapped codes
    return 'type-error';
  }
}
