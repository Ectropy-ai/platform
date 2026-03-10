// Events module types for Node.js

declare module 'events' {
  export class EventEmitter {
    static readonly captureRejections: boolean;
    static readonly defaultMaxListeners: number;
    static listenerCount(emitter: EventEmitter, event: string | symbol): number;

    constructor(options?: { captureRejections?: boolean });

    addListener(
      event: string | symbol,
      listener: (...args: any[]) => void
    ): this;
    on(event: string | symbol, listener: (...args: any[]) => void): this;
    once(event: string | symbol, listener: (...args: any[]) => void): this;
    removeListener(
      event: string | symbol,
      listener: (...args: any[]) => void
    ): this;
    off(event: string | symbol, listener: (...args: any[]) => void): this;
    removeAllListeners(event?: string | symbol): this;
    setMaxListeners(n: number): this;
    getMaxListeners(): number;
    listeners(event: string | symbol): ((...args: any[]) => void)[];
    rawListeners(event: string | symbol): ((...args: any[]) => void)[];
    emit(event: string | symbol, ...args: any[]): boolean;
    eventNames(): (string | symbol)[];
    listenerCount(event: string | symbol): number;
    prependListener(
      event: string | symbol,
      listener: (...args: any[]) => void
    ): this;
    prependOnceListener(
      event: string | symbol,
      listener: (...args: any[]) => void
    ): this;
  }

  export default EventEmitter;
}
