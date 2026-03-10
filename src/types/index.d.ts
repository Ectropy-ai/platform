// Global type declarations for Ectropy Federated Construction Platform

/// <reference path="./node.d.ts" />
/// <reference path="./http.d.ts" />
/// <reference path="./events.d.ts" />
/// <reference path="./modules.d.ts" />
/// <reference path="./express.d.ts" />

import { EventEmitter } from 'events';

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV?: 'development' | 'production' | 'test' | 'staging';
      API_BASE_URL?: string;
      DATABASE_URL?: string;
      REDIS_URL?: string;
      JWT_SECRET?: string;
      SPECKLE_SERVER_URL?: string;
      SPECKLE_TOKEN?: string;
      [key: string]: string | undefined;
    }
  }

  // Express type augmentations
  namespace Express {
    interface Request {
      user?: import('@ectropy/shared/types').User;
      session?: any;
    }
  }

  // Jest custom matchers
  namespace jest {
    interface Matchers<R> {
      toBeWithinRange(floor: number, ceiling: number): R;
    }
  }
}

// Module declarations for packages without types
declare module 'luxon' {
  export * from 'luxon';
}

declare module 'express' {
  import { IncomingMessage, ServerResponse } from 'http';

  export interface Request extends IncomingMessage {
    body: any;
    params: any;
    query: any;
    cookies: any;
    ip: string;
    ips: string[];
    secure: boolean;
    get(name: string): string | undefined;
    header(name: string): string | undefined;
    user?: any;
    session?: any;
    rawHeaders: string[];
    hostname: string;
    protocol: string;
    originalUrl: string;
    path: string;
    fresh: boolean;
    stale: boolean;
    xhr: boolean;
    route?: any;
    baseUrl: string;
    accepts(types: string | string[]): string | string[] | boolean;
    acceptsCharsets(charset: string | string[]): string | string[] | boolean;
    acceptsEncodings(encoding: string | string[]): string | string[] | boolean;
    acceptsLanguages(lang: string | string[]): string | string[] | boolean;
    is(type: string | string[]): string | false | null;
    param(name: string, defaultValue?: any): any;
    range(size: number, options?: any): any;
  }

  export interface Response extends ServerResponse {
    json(body?: any): this;
    status(code: number): this;
    send(body?: any): this;
    redirect(url: string): void;
    redirect(status: number, url: string): void;
    cookie(name: string, value: any, options?: any): this;
    clearCookie(name: string, options?: any): this;
    locals: any;
    header(field: string, value?: string | string[]): this;
    append(field: string, value: string | string[]): this;
    attachment(filename?: string): this;
    download(path: string, callback?: (err: any) => void): void;
    download(
      path: string,
      filename: string,
      callback?: (err: any) => void
    ): void;
    format(obj: any): this;
    get(field: string): string | undefined;
    links(links: any): this;
    location(path: string): this;
    render(
      view: string,
      options?: any,
      callback?: (err: Error, html: string) => void
    ): void;
    render(view: string, callback?: (err: Error, html: string) => void): void;
    sendFile(path: string, options?: any, callback?: (err: any) => void): void;
    sendStatus(code: number): this;
    set(field: any): this;
    set(field: string, value: string | string[]): this;
    type(type: string): this;
    vary(field: string): this;
  }

  export interface NextFunction {
    (err?: any): void;
  }

  export interface Application {
    use(handler: any): Application;
    use(path: string, handler: any): Application;
    get(path: string, ...handlers: any[]): Application;
    post(path: string, ...handlers: any[]): Application;
    put(path: string, ...handlers: any[]): Application;
    delete(path: string, ...handlers: any[]): Application;
    patch(path: string, ...handlers: any[]): Application;
    options(path: string, ...handlers: any[]): Application;
    head(path: string, ...handlers: any[]): Application;
    all(path: string, ...handlers: any[]): Application;
    listen(port: number, callback?: () => void): any;
    listen(port: number, hostname: string, callback?: () => void): any;
    listen(
      port: number,
      hostname: string,
      backlog: number,
      callback?: () => void
    ): any;
    listen(path: string, callback?: () => void): any;
    listen(handle: any, callback?: () => void): any;
    set(setting: string, val: any): this;
    get(setting: string): any;
    enabled(setting: string): boolean;
    disabled(setting: string): boolean;
    enable(setting: string): this;
    disable(setting: string): this;
    engine(
      ext: string,
      fn: (
        path: string,
        options: any,
        callback: (e: any, rendered?: string) => void
      ) => void
    ): this;
    param(name: string, handler: RequestParamHandler): this;
    param(
      callback: (name: string, matcher: RegExp) => RequestParamHandler
    ): this;
    path(): string;
    render(
      name: string,
      options?: any,
      callback?: (err: Error, html: string) => void
    ): void;
    render(name: string, callback: (err: Error, html: string) => void): void;
    route(path: string): any;
    locals: any;
    mountpath: string | string[];
    on(event: string, callback: (parent: Application) => void): this;
  }

  export interface RequestHandler {
    (req: Request, res: Response, next: NextFunction): void;
  }

  export interface ErrorRequestHandler {
    (err: any, req: Request, res: Response, next: NextFunction): void;
  }

  export interface RequestParamHandler {
    (
      req: Request,
      res: Response,
      next: NextFunction,
      value: any,
      name: string
    ): void;
  }

  export interface Router {
    use(handler: RequestHandler): Router;
    use(handler: ErrorRequestHandler): Router;
    use(path: string, handler: RequestHandler): Router;
    use(path: string, handler: ErrorRequestHandler): Router;
    get(path: string, ...handlers: RequestHandler[]): Router;
    post(path: string, ...handlers: RequestHandler[]): Router;
    put(path: string, ...handlers: RequestHandler[]): Router;
    delete(path: string, ...handlers: RequestHandler[]): Router;
    patch(path: string, ...handlers: RequestHandler[]): Router;
    options(path: string, ...handlers: RequestHandler[]): Router;
    head(path: string, ...handlers: RequestHandler[]): Router;
    all(path: string, ...handlers: RequestHandler[]): Router;
    param(name: string, handler: RequestParamHandler): Router;
    route(path: string): any;
  }

  function express(): Application;

  namespace express {
    export function Router(options?: any): Router;
    export function static(root: string, options?: any): RequestHandler;
    export function json(options?: any): RequestHandler;
    export function raw(options?: any): RequestHandler;
    export function text(options?: any): RequestHandler;
    export function urlencoded(options?: any): RequestHandler;
    export const request: Request;
    export const response: Response;
  }

  export default express;
}

declare module 'pg' {
  import { EventEmitter } from 'events';

  export interface PoolConfig {
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
    max?: number;
    min?: number;
    idleTimeoutMillis?: number;
    connectionTimeoutMillis?: number;
    ssl?: boolean | any;
    statement_timeout?: number;
    query_timeout?: number;
    application_name?: string;
    connectionString?: string;
  }

  export interface QueryResult<T = any> {
    rows: T[];
    rowCount: number;
    command: string;
    oid: number;
    fields: any[];
  }

  export class Pool extends EventEmitter {
    constructor(config?: PoolConfig);
    query(text: string, params?: any[]): Promise<QueryResult>;
    query(config: { text: string; values?: any[] }): Promise<QueryResult>;
    connect(): Promise<PoolClient>;
    end(): Promise<void>;

    totalCount: number;
    idleCount: number;
    waitingCount: number;
  }

  export interface PoolClient {
    query(text: string, params?: any[]): Promise<QueryResult>;
    query(config: { text: string; values?: any[] }): Promise<QueryResult>;
    release(err?: Error): void;
  }

  export class Client extends EventEmitter {
    constructor(config?: PoolConfig);
    connect(): Promise<void>;
    query(text: string, params?: any[]): Promise<QueryResult>;
    query(config: { text: string; values?: any[] }): Promise<QueryResult>;
    end(): Promise<void>;
  }
}

// EventEmitter base class for services
export class ServiceEventEmitter extends EventEmitter {
  emit(event: string | symbol, ...args: any[]): boolean;
  on(event: string | symbol, listener: (...args: any[]) => void): this;
  once(event: string | symbol, listener: (...args: any[]) => void): this;
}

// Common interfaces for the platform
export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
}

export interface ServerConfig {
  port: number;
  host: string;
  cors: {
    origin: string[];
    credentials: boolean;
  };
}

// Speckle integration types
export interface SpeckleConfig {
  serverUrl: string;
  token: 'REDACTED';
  projectId?: string;
}

export interface SpeckleObject {
  id: string;
  speckle_type: string;
  data: Record<string, any>;
}

// BIM/IFC types
export interface IFCElement {
  id: string;
  type: string;
  properties: Record<string, any>;
  geometry?: any;
}

// API response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Authentication types
export interface User {
  id: string;
  username: string;
  email: string;
  role: string;
  permissions: string[];
}

export interface AuthToken {
  token: 'REDACTED';
  refreshToken: 'REDACTED';
  expiresAt: Date;
}

export {};
