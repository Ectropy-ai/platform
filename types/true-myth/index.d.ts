declare module 'true-myth/result' {
  export type Result<T, E> = Ok<T> | Err<E>;
  export class Ok<T> {
    constructor(value: T);
    isOk(): boolean;
    isErr(): boolean;
  }
  export class Err<E> {
    constructor(error: E);
    isOk(): boolean;
    isErr(): boolean;
  }
}
