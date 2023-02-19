export interface AbortControllerEsque {
  new (): AbortControllerInstanceEsque;
}

/**
 * Allows you to abort one or more requests.
 */
export interface AbortControllerInstanceEsque {
  /**
   * The AbortSignal object associated with this object.
   */
  readonly signal: AbortSignal;

  /**
   * Sets this object's AbortSignal's aborted flag and signals to
   * any observers that the associated activity is to be aborted.
   */
  abort(): void;
}

/**
 * A subset of the standard fetch function type needed by tRPC internally.
 * @see fetch from lib.dom.d.ts
 * @remarks
 * If you need a property that you know exists but doesn't exist on this
 * interface, go ahead and add it.
 */
export type FetchEsque = (
  input: RequestInfo | URL | string,
  init?: RequestInit | RequestInitEsque,
) => Promise<ResponseEsque>;

/**
 * A simpler version of the native fetch function's type for packages with
 * their own fetch types, such as undici and node-fetch.
 */
export type NativeFetchEsque = (
  url: string | URL,
  init?: NodeFetchRequestInitEsque,
) => Promise<ResponseEsque>;

export interface NodeFetchRequestInitEsque {
  body?: string;
}

/**
 * A subset of the standard Headers properties needed by tRPC internally.
 * @see Headers from lib.dom.d.ts
 * @remarks
 * If you need a property that you know exists but doesn't exist on this
 * interface, go ahead and add it.
 */
export interface HeadersEsque {
  append(name: string, value: string): void;
  delete(name: string): void;
  get(name: string): string | null;
  has(name: string): boolean;
  set(name: string, value: string): void;
  forEach(
    callbackfn: (value: string, key: string) => void,
    thisArg?: any,
  ): void;
}

export type ResponseType =
  | 'basic'
  | 'cors'
  | 'default'
  | 'error'
  | 'opaque'
  | 'opaqueredirect';

/**
 * A subset of the standard RequestInit properties needed by tRPC internally.
 * @see RequestInit from lib.dom.d.ts
 * @remarks
 * If you need a property that you know exists but doesn't exist on this
 * interface, go ahead and add it.
 */
export interface RequestInitEsque {
  /**
   * Sets the request's body.
   */
  body?: string | ReadableStream | null;

  /**
   * Sets the request's associated headers.
   */
  headers?: [string, string][] | Record<string, string>;

  /**
   * The request's HTTP-style method.
   */
  method?: string;

  /**
   * Sets the request's signal.
   */
  signal?: AbortSignal | null;
}

/**
 * A subset of the standard Response properties needed by tRPC internally.
 * @see Response from lib.dom.d.ts
 * @remarks
 * If you need a property that you know exists but doesn't exist on this
 * interface, go ahead and add it.
 */
export interface ResponseEsque {
  readonly headers: HeadersEsque;
  readonly ok: boolean;
  readonly redirected: boolean;
  readonly status: number;
  readonly statusText: string;
  readonly type: ResponseType;
  readonly url: string;
  clone(): ResponseEsque;

  /**
   * @remarks
   * The built-in Response::json() method returns Promise<any>, but
   * that's not as type-safe as unknown. We use unknown because we're
   * more type-safe. You do want more type safety, right? 😉
   */
  json(): Promise<unknown>;
}
