// Minimal winston types for compilation
declare module 'winston' {
  export interface Logger {
    error(message: string, meta?: any): void;
    warn(message: string, meta?: any): void;
    info(message: string, meta?: any): void;
    debug(message: string, meta?: any): void;
    level: string;
    format: any;
    transports: any[];
  }

  export interface LoggerOptions {
    level?: string;
    format?: any;
    transports?: any[];
    exitOnError?: boolean;
    defaultMeta?: any;
  }

  export function createLogger(options: LoggerOptions): Logger;

  export namespace format {
    function combine(...formats: any[]): any;
    function timestamp(): any;
    function errors(options?: any): any;
    function json(): any;
    function colorize(): any;
    function printf(templateFunction: (info: any) => string): any;
    function metadata(options?: any): any;
  }

  export namespace transports {
    class Console {
      constructor(options?: any);
    }
    class File {
      constructor(options?: any);
    }
  }

  namespace winston {
    export interface Logger {
      error(message: string, meta?: any): void;
      warn(message: string, meta?: any): void;
      info(message: string, meta?: any): void;
      debug(message: string, meta?: any): void;
      level: string;
      format: any;
      transports: any[];
    }
  }

  const winston: {
    createLogger: typeof createLogger;
    format: typeof format;
    transports: typeof transports;
    Logger: winston.Logger;
  };
  export default winston;
}
