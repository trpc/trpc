import type {
  TRPCConnectionParamsMessage,
  TRPCRequestInfo,
} from '@trpc/server/unstable-core-do-not-import';
import type {
  CallbackOrValue,
  UrlOptionsWithConnectionParams,
} from '../../internals/urlWithConnectionParams';
import { resultOf } from '../../internals/urlWithConnectionParams';
import type { Encoder } from './encoder';

export class TRPCWebSocketClosedError extends Error {
  constructor(opts: { message: string; cause?: unknown }) {
    super(opts.message, {
      cause: opts.cause,
    });
    this.name = 'TRPCWebSocketClosedError';
    Object.setPrototypeOf(this, TRPCWebSocketClosedError.prototype);
  }
}

/**
 * Calls a user callback, including `connectionState` subscribers. A throw
 * would skip the rest of the client's bookkeeping (e.g. end the reconnect
 * loop, or, with event-emitter based WebSockets such as `ws`, skip the other
 * listeners for that event), so it is rethrown asynchronously instead.
 */
export function callUserCallback(callback: () => void) {
  try {
    callback();
  } catch (error) {
    rethrowAsync(error);
  }
}

/**
 * Rethrows an error asynchronously, so it's reported like any other uncaught
 * error without unwinding the client's bookkeeping.
 */
export function rethrowAsync(error: unknown) {
  setTimeout(() => {
    throw error;
  });
}

// Ponyfill for Promise.withResolvers https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/withResolvers
export function withResolvers<T>() {
  let resolve: (value: T | PromiseLike<T>) => void;
  let reject: (reason?: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  // oxlint-disable-next-line typescript/no-non-null-assertion
  return { promise, resolve: resolve!, reject: reject! };
}

/**
 * Resolves a WebSocket URL and optionally appends connection parameters.
 *
 * If connectionParams are provided, appends 'connectionParams=1' query parameter.
 */
export async function prepareUrl(urlOptions: UrlOptionsWithConnectionParams) {
  const url = await resultOf(urlOptions.url);

  if (!urlOptions.connectionParams) return url;

  // append `?connectionParams=1` when connection params are used
  const prefix = url.includes('?') ? '&' : '?';
  const connectionParams = `${prefix}connectionParams=1`;

  return url + connectionParams;
}

export async function buildConnectionMessage(
  connectionParams: CallbackOrValue<TRPCRequestInfo['connectionParams']>,
  encoder: Encoder,
) {
  const message: TRPCConnectionParamsMessage = {
    method: 'connectionParams',
    data: await resultOf(connectionParams),
  };

  return encoder.encode(message);
}
