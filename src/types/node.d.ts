// Node.js type definitions for compatibility

declare namespace NodeJS {
  interface Process {
    env: ProcessEnv;
    exit(code?: number): never;
    on(event: string, listener: (...args: any[]) => void): this;
    once(event: string, listener: (...args: any[]) => void): this;
    cwd(): string;
    platform: string;
    arch: string;
    version: string;
    versions: {
      node: string;
      [key: string]: string;
    };
    uptime(): number;
    memoryUsage(): {
      rss: number;
      heapTotal: number;
      heapUsed: number;
      external: number;
      arrayBuffers: number;
    };
    cpuUsage(previousValue?: { user: number; system: number }): {
      user: number;
      system: number;
    };
  }

  interface ProcessEnv {
    [key: string]: string | undefined;
    NODE_ENV?: 'development' | 'production' | 'test' | 'staging';
    API_BASE_URL?: string;
    DATABASE_URL?: string;
    REDIS_URL?: string;
    JWT_SECRET?: string;
    SPECKLE_SERVER_URL?: string;
    SPECKLE_TOKEN?: string;
    PORT?: string;
    HOST?: string;
  }

  interface Global {
    [key: string]: any;
  }
}

declare global {
  var process: NodeJS.Process;
  var console: Console;
  var Buffer: BufferConstructor;
  var global: NodeJS.Global;
  var __dirname: string;
  var __filename: string;
  var require: NodeRequire;
  var module: NodeModule;
  var exports: any;
  var setTimeout: (
    callback: (...args: any[]) => void,
    delay: number,
    ...args: any[]
  ) => NodeJS.Timeout;
  var clearTimeout: (timeoutId: NodeJS.Timeout) => void;
  var setInterval: (
    callback: (...args: any[]) => void,
    delay: number,
    ...args: any[]
  ) => NodeJS.Timer;
  var clearInterval: (intervalId: NodeJS.Timer) => void;
  var setImmediate: (
    callback: (...args: any[]) => void,
    ...args: any[]
  ) => NodeJS.Immediate;
  var clearImmediate: (immediateId: NodeJS.Immediate) => void;

  namespace NodeJS {
    interface Timer {
      hasRef(): boolean;
      ref(): this;
      refresh(): this;
      unref(): this;
    }

    interface Immediate {
      hasRef(): boolean;
      ref(): this;
      unref(): this;
    }

    interface Timeout extends Timer {
      close(): void;
    }
  }

  interface Console {
    log(...data: any[]): void;
    error(...data: any[]): void;
    warn(...data: any[]): void;
    info(...data: any[]): void;
    debug(...data: any[]): void;
    trace(...data: any[]): void;
    dir(obj: any, options?: any): void;
    time(label?: string): void;
    timeEnd(label?: string): void;
    assert(condition?: boolean, ...data: any[]): void;
  }

  interface BufferConstructor {
    from(data: any): Buffer;
    alloc(size: number): Buffer;
    allocUnsafe(size: number): Buffer;
  }

  interface Buffer {
    toString(encoding?: string): string;
    length: number;
  }

  interface NodeRequire {
    (id: string): any;
    resolve: {
      (id: string, options?: { paths?: string[] }): string;
      paths(request: string): string[] | null;
    };
    cache: any;
    extensions: any;
    main: NodeModule | undefined;
  }

  interface NodeModule {
    exports: any;
    require: NodeRequire;
    id: string;
    filename: string;
    loaded: boolean;
    parent: NodeModule | null;
    children: NodeModule[];
    paths: string[];
  }

  interface BufferConstructor {
    new (str: string, encoding?: BufferEncoding): Buffer;
    new (size: number): Buffer;
    new (array: Uint8Array): Buffer;
    new (arrayBuffer: ArrayBuffer): Buffer;
    new (array: ReadonlyArray<any>): Buffer;
    new (buffer: Buffer): Buffer;
    from(str: string, encoding?: BufferEncoding): Buffer;
    from(data: Uint8Array | ReadonlyArray<number>): Buffer;
    from(data: ArrayBuffer, byteOffset?: number, length?: number): Buffer;
    alloc(
      size: number,
      fill?: string | Buffer | number,
      encoding?: BufferEncoding
    ): Buffer;
    allocUnsafe(size: number): Buffer;
    allocUnsafeSlow(size: number): Buffer;
    isBuffer(obj: any): obj is Buffer;
    compare(buf1: Uint8Array, buf2: Uint8Array): number;
    concat(list: ReadonlyArray<Uint8Array>, totalLength?: number): Buffer;
    byteLength(string: string, encoding?: BufferEncoding): number;
  }

  interface Buffer extends Uint8Array {
    constructor: BufferConstructor;
    write(
      string: string,
      offset?: number,
      length?: number,
      encoding?: BufferEncoding
    ): number;
    toString(encoding?: BufferEncoding, start?: number, end?: number): string;
    toJSON(): { type: 'Buffer'; data: number[] };
    equals(otherBuffer: Uint8Array): boolean;
    compare(
      target: Uint8Array,
      targetStart?: number,
      targetEnd?: number,
      sourceStart?: number,
      sourceEnd?: number
    ): number;
    copy(
      target: Uint8Array,
      targetStart?: number,
      sourceStart?: number,
      sourceEnd?: number
    ): number;
    slice(start?: number, end?: number): Buffer;
    subarray(start?: number, end?: number): Buffer;
    readUIntLE(offset: number, byteLength: number): number;
    readUIntBE(offset: number, byteLength: number): number;
    readIntLE(offset: number, byteLength: number): number;
    readIntBE(offset: number, byteLength: number): number;
    readUInt8(offset: number): number;
    readUInt16LE(offset: number): number;
    readUInt16BE(offset: number): number;
    readUInt32LE(offset: number): number;
    readUInt32BE(offset: number): number;
    readInt8(offset: number): number;
    readInt16LE(offset: number): number;
    readInt16BE(offset: number): number;
    readInt32LE(offset: number): number;
    readInt32BE(offset: number): number;
    readFloatLE(offset: number): number;
    readFloatBE(offset: number): number;
    readDoubleLE(offset: number): number;
    readDoubleBE(offset: number): number;
    writeUIntLE(value: number, offset: number, byteLength: number): number;
    writeUIntBE(value: number, offset: number, byteLength: number): number;
    writeIntLE(value: number, offset: number, byteLength: number): number;
    writeIntBE(value: number, offset: number, byteLength: number): number;
    writeUInt8(value: number, offset: number): number;
    writeUInt16LE(value: number, offset: number): number;
    writeUInt16BE(value: number, offset: number): number;
    writeUInt32LE(value: number, offset: number): number;
    writeUInt32BE(value: number, offset: number): number;
    writeInt8(value: number, offset: number): number;
    writeInt16LE(value: number, offset: number): number;
    writeInt16BE(value: number, offset: number): number;
    writeInt32LE(value: number, offset: number): number;
    writeInt32BE(value: number, offset: number): number;
    writeFloatLE(value: number, offset: number): number;
    writeFloatBE(value: number, offset: number): number;
    writeDoubleLE(value: number, offset: number): number;
    writeDoubleBE(value: number, offset: number): number;
    fill(
      value: string | Uint8Array | number,
      offset?: number,
      end?: number,
      encoding?: BufferEncoding
    ): this;
    indexOf(
      value: string | number | Uint8Array,
      byteOffset?: number,
      encoding?: BufferEncoding
    ): number;
    lastIndexOf(
      value: string | number | Uint8Array,
      byteOffset?: number,
      encoding?: BufferEncoding
    ): number;
    includes(
      value: string | number | Buffer,
      byteOffset?: number,
      encoding?: BufferEncoding
    ): boolean;
    keys(): IterableIterator<number>;
    values(): IterableIterator<number>;
    entries(): IterableIterator<[number, number]>;
    swap16(): Buffer;
    swap32(): Buffer;
    swap64(): Buffer;
    readBigUInt64BE?: (offset: number) => bigint;
    readBigUInt64LE?: (offset: number) => bigint;
    readBigInt64BE?: (offset: number) => bigint;
    readBigInt64LE?: (offset: number) => bigint;
    writeBigInt64BE?: (value: bigint, offset: number) => number;
    writeBigInt64LE?: (value: bigint, offset: number) => number;
    writeBigUInt64BE?: (value: bigint, offset: number) => number;
    writeBigUInt64LE?: (value: bigint, offset: number) => number;
  }

  type BufferEncoding =
    | 'ascii'
    | 'utf8'
    | 'utf-8'
    | 'utf16le'
    | 'ucs2'
    | 'ucs-2'
    | 'base64'
    | 'latin1'
    | 'binary'
    | 'hex';
}

export {};
