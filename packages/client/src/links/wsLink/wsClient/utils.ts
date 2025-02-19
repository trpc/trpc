import type {
  TRPCConnectionParamsMessage,
  TRPCRequestInfo,
} from '@trpc/server/unstable-core-do-not-import';
import type {
  CallbackOrValue,
  UrlOptionsWithConnectionParams,
} from '../../internals/urlWithConnectionParams';
import { resultOf } from '../../internals/urlWithConnectionParams';

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
 * Utility class for managing a timeout that can be started, stopped, and reset.
 * Useful for scenarios where the timeout duration is reset dynamically based on events.
 */
export class ResettableTimeout {
  private timeout: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly onTimeout: () => void,
    private readonly timeoutMs: number,
  ) {}

  /**
   * Resets the current timeout, restarting it with the same duration.
   * Does nothing if no timeout is active.
   */
  public reset() {
    if (!this.timeout) return;

    clearTimeout(this.timeout);
    this.timeout = setTimeout(this.onTimeout, this.timeoutMs);
  }

  public start() {
    clearTimeout(this.timeout);
    this.timeout = setTimeout(this.onTimeout, this.timeoutMs);
  }

  public stop() {
    clearTimeout(this.timeout);
    this.timeout = undefined;
  }
}

// Ponyfill for Promise.withResolvers https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/withResolvers
export function withResolvers<T>() {
  let resolve: (value: T | PromiseLike<T>) => void;
  let reject: (reason?: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
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
) {
  const message: TRPCConnectionParamsMessage = {
    method: 'connectionParams',
    data: await resultOf(connectionParams),
  };

  return JSON.stringify(message);
}
