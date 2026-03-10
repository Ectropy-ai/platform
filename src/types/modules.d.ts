// Common npm modules type declarations

declare module 'pg' {
  export interface PoolConfig {
    connectionString?: string;
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
    max?: number;
  }

  export interface QueryResult<T = any> {
    rows: T[];
    rowCount: number;
    command: string;
  }

  export interface PoolClient {
    query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>>;
    release(): void;
  }

  export class Pool {
    constructor(config?: PoolConfig);
    query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>>;
    connect(): Promise<PoolClient>;
    end(): Promise<void>;
    on(event: string, listener: (...args: any[]) => void): this;
  }
}


declare module 'express' {
  import { User } from '@ectropy/shared/types';

  export interface Request {
    user?: User;
    body: any;
    params: any;
    query: any;
    headers: any;
    ip: string;
    method: string;
    url: string;
    originalUrl: string;
  }

  export interface Response {
    status(code: number): Response;
    json(object: any): Response;
    send(body?: any): Response;
    header(field: string, value?: string): Response;
    set(field: string, value?: string): Response;
    cookie(name: string, value: any, options?: any): Response;
    clearCookie(name: string, options?: any): Response;
    redirect(url: string): void;
    end(): void;
  }

  export interface NextFunction {
    (err?: any): void;
  }

  export interface Router {
    get(path: string, ...handlers: any[]): Router;
    post(path: string, ...handlers: any[]): Router;
    put(path: string, ...handlers: any[]): Router;
    delete(path: string, ...handlers: any[]): Router;
    use(path?: string | any, ...handlers: any[]): Router;
  }

  export interface Application extends Router {
    listen(port: number, callback?: () => void): any;
    use(path?: string | any, ...handlers: any[]): Application;
  }

  export interface RequestHandler {
    (req: Request, res: Response, next: NextFunction): void;
  }

  function express(): Application;
  namespace express {
    function Router(): Router;
    function static(root: string): RequestHandler;
    function json(options?: any): RequestHandler;
    function urlencoded(options?: any): RequestHandler;
  }
  export default express;
}

declare module 'cors' {
  import { RequestHandler } from 'express';

  interface CorsOptions {
    origin?:
      | boolean
      | string
      | RegExp
      | (string | RegExp)[]
      | ((
          origin: string | undefined,
          callback: (err: Error | null, allow?: boolean) => void
        ) => void);
    credentials?: boolean;
    exposedHeaders?: string | string[];
    allowedHeaders?: string | string[];
    methods?: string | string[];
    preflightContinue?: boolean;
    optionsSuccessStatus?: number;
  }

  function cors(options?: CorsOptions): RequestHandler;
  export default cors;
}

declare module 'helmet' {
  import { RequestHandler } from 'express';

  interface HelmetOptions {
    contentSecurityPolicy?: any;
    crossOriginEmbedderPolicy?: boolean;
    crossOriginOpenerPolicy?: any;
    crossOriginResourcePolicy?: any;
    dnsPrefetchControl?: any;
    expectCt?: any;
    frameguard?: any;
    hidePoweredBy?: any;
    hsts?: any;
    ieNoOpen?: boolean;
    noSniff?: boolean;
    originAgentCluster?: boolean;
    permittedCrossDomainPolicies?: any;
    referrerPolicy?: any;
    xssFilter?: boolean;
  }

  function helmet(options?: HelmetOptions): RequestHandler;
  export default helmet;
}

declare module 'morgan' {
  import { RequestHandler } from 'express';

  type FormatFn = (tokens: any, req: any, res: any) => string;
  type TokenIndexer = (
    req: any,
    res: any,
    arg?: string | number | boolean
  ) => string;

  interface Options {
    buffer?: boolean;
    immediate?: boolean;
    skip?: (req: any, res: any) => boolean;
    stream?: NodeJS.WritableStream;
  }

  function morgan(format: string | FormatFn, options?: Options): RequestHandler;

  namespace morgan {
    function compile(format: string): FormatFn;
    function format(name: string, fmt: string | FormatFn): morgan;
    function token(name: string, fn: TokenIndexer): morgan;
  }

  export default morgan;
}

declare module 'compression' {
  import { RequestHandler } from 'express';

  interface CompressionOptions {
    chunkSize?: number;
    filter?: (req: any, res: any) => boolean;
    level?: number;
    memLevel?: number;
    strategy?: number;
    threshold?: number | string;
    windowBits?: number;
  }

  function compression(options?: CompressionOptions): RequestHandler;
  export default compression;
}

declare module 'cookie-parser' {
  import { RequestHandler } from 'express';

  interface CookieParseOptions {
    decode?: (str: string) => string;
  }

  function cookieParser(
    secret?: string | string[],
    options?: CookieParseOptions
  ): RequestHandler;
  export default cookieParser;
}


declare module 'dotenv' {
  export interface DotenvConfigOptions {
    path?: string;
    encoding?: string;
    debug?: boolean;
    override?: boolean;
  }

  export interface DotenvConfigOutput {
    parsed?: { [name: string]: string };
    error?: Error;
  }

  export function config(options?: DotenvConfigOptions): DotenvConfigOutput;
  export function parse(src: string): { [name: string]: string };
}

declare module 'bcryptjs' {
  export function genSalt(rounds?: number): Promise<string>;
  export function genSalt(
    rounds: number,
    callback: (err: Error | null, salt: string) => void
  ): void;
  export function genSaltSync(rounds?: number): string;

  export function hash(
    data: string,
    saltOrRounds: string | number
  ): Promise<string>;
  export function hash(
    data: string,
    saltOrRounds: string | number,
    callback: (err: Error | null, hash: string) => void
  ): void;
  export function hashSync(data: string, saltOrRounds: string | number): string;

  export function compare(data: string, hash: string): Promise<boolean>;
  export function compare(
    data: string,
    hash: string,
    callback: (err: Error | null, same: boolean) => void
  ): void;
  export function compareSync(data: string, hash: string): boolean;

  export function getRounds(hash: string): number;
}

declare module 'jsonwebtoken' {
  export interface SignOptions {
    algorithm?: string;
    expiresIn?: string | number;
    issuer?: string;
    subject?: string;
    audience?: string;
    keyid?: string;
    header?: any;
    encoding?: string;
  }

  export interface VerifyOptions {
    algorithms?: string[];
    audience?: string | RegExp | (string | RegExp)[];
    clockTimestamp?: number;
    clockTolerance?: number;
    issuer?: string | string[];
    jwtid?: string;
    subject?: string;
    maxAge?: string | number;
    ignoreExpiration?: boolean;
    ignoreNotBefore?: boolean;
  }

  export interface DecodeOptions {
    complete?: boolean;
    json?: boolean;
  }

  export function sign(
    payload: any,
    secretOrPrivateKey: string,
    options?: SignOptions
  ): string;
  export function sign(
    payload: any,
    secretOrPrivateKey: string,
    callback: (err: Error | null, token: string | undefined) => void
  ): void;
  export function sign(
    payload: any,
    secretOrPrivateKey: string,
    options: SignOptions,
    callback: (err: Error | null, token: string | undefined) => void
  ): void;

  export function verify(token: string, secretOrPublicKey: string): any;
  export function verify(
    token: string,
    secretOrPublicKey: string,
    callback: (err: Error | null, decoded: any) => void
  ): void;
  export function verify(
    token: string,
    secretOrPublicKey: string,
    options: any,
    callback: (err: Error | null, decoded: any) => void
  ): void;

  export function decode(token: string, options?: any): any;
}

declare module 'uuid' {
  export function v1(options?: any, buffer?: any, offset?: number): string;
  export function v4(options?: any, buffer?: any, offset?: number): string;
  export function v5(
    name: string,
    namespace: string,
    buffer?: any,
    offset?: number
  ): string;
  export function parse(uuid: string): Uint8Array;
  export function stringify(arr: Uint8Array, offset?: number): string;
  export function validate(uuid: string): boolean;
  export function version(uuid: string): number;
}

declare module 'winston' {
  export interface LogEntry {
    level: string;
    message: string;
    meta?: any;
    timestamp?: Date;
  }

  export interface Logger {
    log(level: string, message: string, meta?: any): Logger;
    log(entry: LogEntry): Logger;
    debug(message: string, meta?: any): Logger;
    verbose(message: string, meta?: any): Logger;
    info(message: string, meta?: any): Logger;
    warn(message: string, meta?: any): Logger;
    error(message: string, meta?: any): Logger;

    add(transport: any): Logger;
    remove(transport: any): Logger;
    clear(): Logger;
    profile(id: string, meta?: any): Logger;
    startTimer(): any;
  }

  export interface LoggerOptions {
    level?: string;
    levels?: any;
    format?: any;
    transports?: any[];
    exitOnError?: boolean;
    silent?: boolean;
  }

  export function createLogger(options?: LoggerOptions): Logger;

  export const format: any;
  export const transports: any;
  export const config: any;
}

declare module 'axios' {
  export interface AxiosRequestConfig {
    url?: string;
    method?: string;
    baseURL?: string;
    transformRequest?: any;
    transformResponse?: any;
    headers?: any;
    params?: any;
    data?: any;
    timeout?: number;
    withCredentials?: boolean;
    responseType?: string;
    maxContentLength?: number;
    validateStatus?: (status: number) => boolean;
    maxRedirects?: number;
    httpAgent?: any;
    httpsAgent?: any;
    proxy?: any;
    cancelToken?: any;
  }

  export interface AxiosResponse<T = any> {
    data: T;
    status: number;
    statusText: string;
    headers: any;
    config: AxiosRequestConfig;
    request?: any;
  }

  export interface AxiosError<T = any> extends Error {
    config: AxiosRequestConfig;
    code?: string;
    request?: any;
    response?: AxiosResponse<T>;
    isAxiosError: boolean;
  }

  export interface AxiosInstance {
    (config: AxiosRequestConfig): Promise<AxiosResponse>;
    (url: string, config?: AxiosRequestConfig): Promise<AxiosResponse>;
    defaults: AxiosRequestConfig;
    interceptors: {
      request: any;
      response: any;
    };
    get<T = any>(
      url: string,
      config?: AxiosRequestConfig
    ): Promise<AxiosResponse<T>>;
    delete<T = any>(
      url: string,
      config?: AxiosRequestConfig
    ): Promise<AxiosResponse<T>>;
    head<T = any>(
      url: string,
      config?: AxiosRequestConfig
    ): Promise<AxiosResponse<T>>;
    post<T = any>(
      url: string,
      data?: any,
      config?: AxiosRequestConfig
    ): Promise<AxiosResponse<T>>;
    put<T = any>(
      url: string,
      data?: any,
      config?: AxiosRequestConfig
    ): Promise<AxiosResponse<T>>;
    patch<T = any>(
      url: string,
      data?: any,
      config?: AxiosRequestConfig
    ): Promise<AxiosResponse<T>>;
  }

  export interface AxiosStatic extends AxiosInstance {
    create(config?: AxiosRequestConfig): AxiosInstance;
    Cancel: any;
    CancelToken: 'REDACTED';
    isCancel(value: any): boolean;
    all<T>(values: Array<T | Promise<T>>): Promise<T[]>;
    spread<T, R>(callback: (...args: T[]) => R): (array: T[]) => R;
  }

  declare const axios: AxiosStatic;
  export default axios;
}

declare module 'graphql' {
  export interface GraphQLSchema {
    query: any;
    mutation?: any;
    subscription?: any;
  }

  export interface GraphQLObjectType {
    name: string;
    fields: any;
  }

  export interface GraphQLFieldConfig<TSource, TContext> {
    type: any;
    args?: any;
    resolve?: (source: TSource, args: any, context: TContext, info: any) => any;
    description?: string;
    deprecationReason?: string;
  }

  export function GraphQLString(): any;
  export function GraphQLInt(): any;
  export function GraphQLFloat(): any;
  export function GraphQLBoolean(): any;
  export function GraphQLID(): any;
  export function GraphQLList(type: any): any;
  export function GraphQLNonNull(type: any): any;
  export function GraphQLScalarType(config: any): any;
  export function GraphQLObjectType(config: any): GraphQLObjectType;
  export function GraphQLSchema(config: any): GraphQLSchema;
  export function buildSchema(source: string): GraphQLSchema;
  export function execute(args: any): Promise<any>;
  export function validate(schema: GraphQLSchema, document: any): any[];
  export function parse(source: string): any;

  export const Kind: {
    SCALAR: string;
    OBJECT: string;
    INTERFACE: string;
    UNION: string;
    ENUM: string;
    INPUT_OBJECT: string;
    LIST: string;
    NON_NULL: string;
    FIELD: string;
    FIELD_DEFINITION: string;
    ARGUMENT: string;
    VALUE: string;
    STRING: string;
    INT: string;
    FLOAT: string;
    BOOLEAN: string;
    NULL: string;
  };
}

declare module 'graphql-tag' {
  function gql(literals: TemplateStringsArray, ...placeholders: any[]): any;
  function gql(source: string): any;
  export default gql;
}

declare module 'fs' {
  export interface Stats {
    isFile(): boolean;
    isDirectory(): boolean;
    size: number;
    mtime: Date;
  }

  export function existsSync(path: string): boolean;
  export function readFileSync(
    path: string,
    encoding?: string
  ): string | Buffer;
  export function writeFileSync(path: string, data: string | Buffer): void;
  export function statSync(path: string): Stats;
  export function readdirSync(path: string): string[];
  export function mkdirSync(path: string, options?: any): void;

  export namespace promises {
    export function readFile(
      path: string,
      encoding?: string
    ): Promise<string | Buffer>;
    export function writeFile(
      path: string,
      data: string | Buffer
    ): Promise<void>;
    export function stat(path: string): Promise<Stats>;
    export function readdir(path: string): Promise<string[]>;
    export function access(path: string, mode?: number): Promise<void>;
    export function mkdir(path: string, options?: any): Promise<void>;
    export function unlink(path: string): Promise<void>;
  }
}

declare module 'dns' {
  export function lookup(
    hostname: string,
    callback: (err: Error | null, address: string, family: number) => void
  ): void;
  export function resolve(
    hostname: string,
    callback: (err: Error | null, addresses: string[]) => void
  ): void;

  export namespace promises {
    export function lookup(
      hostname: string
    ): Promise<{ address: string; family: number }>;
    export function resolve(hostname: string): Promise<string[]>;
    export function resolve4(hostname: string): Promise<string[]>;
  }
}

declare module 'path' {
  export function join(...paths: string[]): string;
  export function resolve(...paths: string[]): string;
  export function dirname(path: string): string;
  export function basename(path: string, ext?: string): string;
  export function extname(path: string): string;
  export function parse(path: string): {
    root: string;
    dir: string;
    base: string;
    ext: string;
    name: string;
  };
  export const sep: string;
}

declare module 'multer' {
  import { RequestHandler } from 'express';

  export interface MulterOptions {
    dest?: string;
    storage?: any;
    limits?: {
      fieldNameSize?: number;
      fieldSize?: number;
      fields?: number;
      fileSize?: number;
      files?: number;
      parts?: number;
      headerPairs?: number;
    };
    fileFilter?: (
      req: any,
      file: any,
      callback: (error: Error | null, acceptFile: boolean) => void
    ) => void;
  }

  export interface MulterFile {
    fieldname: string;
    originalname: string;
    encoding: string;
    mimetype: string;
    size: number;
    destination: string;
    filename: string;
    path: string;
    buffer: Buffer;
  }

  function multer(options?: MulterOptions): {
    single(fieldname: string): RequestHandler;
    array(fieldname: string, maxCount?: number): RequestHandler;
    fields(fields: Array<{ name: string; maxCount?: number }>): RequestHandler;
    none(): RequestHandler;
    any(): RequestHandler;
  };

  export default multer;
}
