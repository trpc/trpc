export type AbortControllerEsque = new () => AbortControllerInstanceEsque;

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
  url: URL | string,
  init?: NodeFetchRequestInitEsque,
) => Promise<ResponseEsque>;

export interface NodeFetchRequestInitEsque {
  body?: string;
}

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
  body?: FormData | ReadableStream | string | null;

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
 * A subset of the standard ReadableStream properties needed by tRPC internally.
 * @see ReadableStream from lib.dom.d.ts
 */
export type WebReadableStreamEsque = {
  getReader: () => ReadableStreamDefaultReader<Uint8Array>;
};

/**
 * A subset of the standard Response properties needed by tRPC internally.
 * @see Response from lib.dom.d.ts
 */
export interface ResponseEsque {
  readonly body?: NodeJS.ReadableStream | WebReadableStreamEsque | null;
  /**
   * @remarks
   * The built-in Response::json() method returns Promise<any>, but
   * that's not as type-safe as unknown. We use unknown because we're
   * more type-safe. You do want more type safety, right? 😉
   */
  json(): Promise<unknown>;
}

/**
 * @internal
 */
export type NonEmptyArray<TItem> = [TItem, ...TItem[]];
