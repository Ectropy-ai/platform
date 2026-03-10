// HTTP module types for Node.js

declare module 'http' {
  import { EventEmitter } from 'events';
  import { Stream } from 'stream';

  export interface IncomingMessage extends Stream.Readable {
    httpVersion: string;
    httpVersionMajor: number;
    httpVersionMinor: number;
    connection: any;
    headers: { [key: string]: string | string[] | undefined };
    rawHeaders: string[];
    trailers: { [key: string]: string | undefined };
    rawTrailers: string[];
    method?: string;
    url?: string;
    statusCode?: number;
    statusMessage?: string;
    socket: any;
    destroy(): void;
  }

  export interface ServerResponse extends Stream.Writable {
    statusCode: number;
    statusMessage: string;
    headersSent: boolean;
    sendDate: boolean;
    connection: any;

    writeHead(
      statusCode: number,
      headers?: { [key: string]: string | string[] }
    ): this;
    writeHead(
      statusCode: number,
      statusMessage?: string,
      headers?: { [key: string]: string | string[] }
    ): this;
    setHeader(name: string, value: string | string[]): void;
    getHeader(name: string): string | string[] | undefined;
    getHeaders(): { [key: string]: string | string[] };
    getHeaderNames(): string[];
    hasHeader(name: string): boolean;
    removeHeader(name: string): void;
    addTrailers(headers: { [key: string]: string }): void;
    end(): void;
    end(chunk: any): void;
    end(chunk: any, encoding: BufferEncoding): void;
    end(chunk: any, callback: () => void): void;
    end(chunk: any, encoding?: BufferEncoding, callback?: () => void): void;
  }

  export interface ClientRequest extends Stream.Writable {
    connection: any;
    socket: any;
    aborted: boolean;

    abort(): void;
    onSocket(socket: any): void;
    setTimeout(timeout: number, callback?: () => void): this;
    setNoDelay(noDelay?: boolean): void;
    setSocketKeepAlive(enable?: boolean, initialDelay?: number): void;
  }

  export interface Server extends EventEmitter {
    listening: boolean;
    maxHeadersCount: number | null;
    timeout: number;
    keepAliveTimeout: number;
    headersTimeout: number;

    listen(
      port?: number,
      hostname?: string,
      listeningListener?: () => void
    ): this;
    listen(
      port?: number,
      hostname?: string,
      backlog?: number,
      listeningListener?: () => void
    ): this;
    listen(
      port?: number,
      backlog?: number,
      listeningListener?: () => void
    ): this;
    listen(port?: number, listeningListener?: () => void): this;
    listen(path: string, listeningListener?: () => void): this;
    listen(options: any, listeningListener?: () => void): this;
    close(callback?: (err?: Error) => void): this;
    address(): any;
    setTimeout(msecs?: number, callback?: () => void): this;

    on(
      event: 'request',
      listener: (req: IncomingMessage, res: ServerResponse) => void
    ): this;
    on(event: 'connection', listener: (socket: any) => void): this;
    on(event: 'close', listener: () => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'listening', listener: () => void): this;
    on(event: string, listener: (...args: any[]) => void): this;
  }

  export function createServer(
    requestListener?: (req: IncomingMessage, res: ServerResponse) => void
  ): Server;
  export function createServer(
    options: any,
    requestListener?: (req: IncomingMessage, res: ServerResponse) => void
  ): Server;

  export function request(
    options: any,
    callback?: (res: IncomingMessage) => void
  ): ClientRequest;
  export function request(
    url: string | URL,
    options?: any,
    callback?: (res: IncomingMessage) => void
  ): ClientRequest;

  export function get(
    options: any,
    callback?: (res: IncomingMessage) => void
  ): ClientRequest;
  export function get(
    url: string | URL,
    options?: any,
    callback?: (res: IncomingMessage) => void
  ): ClientRequest;

  export const METHODS: string[];
  export const STATUS_CODES: { [errorCode: number]: string | undefined };
}
