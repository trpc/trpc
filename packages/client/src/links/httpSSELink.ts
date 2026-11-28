import type { TRPCRequestInfo } from '@trpc/server/http';
import { observable } from '@trpc/server/observable';
import type {
  TRPC_ERROR_CODE_NUMBER,
  TRPCErrorShape,
  TRPCResult,
} from '@trpc/server/rpc';
import type {
  AnyClientTypes,
  inferClientTypes,
  InferrableClientTypes,
  SSEClientOptions,
} from '@trpc/server/unstable-core-do-not-import';
import {
  isObject,
  makeResource,
  retryableRpcCodes,
  run,
  transformResult,
} from '@trpc/server/unstable-core-do-not-import';
import { inputWithTrackedEventId } from '../internals/inputWithTrackedEventId';
import { raceAbortSignalsWithCleanup } from '../internals/signals';
import type { WebReadableStreamEsque } from '../internals/types';
import { TRPCClientError } from '../TRPCClientError';
import type { TransformerOptions } from '../unstable-internals';
import {
  fetchHTTPResponse,
  getBody,
  getUrl,
  resolveHTTPLinkOptions,
  type HTTPLinkBaseOptions,
  type ResolvedHTTPLinkOptions,
} from './internals/httpUtils';
import { sseMessages, type SSEMessage } from './internals/sseParser';
import {
  resultOf,
  type CallbackOrValue,
} from './internals/urlWithConnectionParams';
import type {
  HTTPHeaders,
  Operation,
  OperationResultEnvelope,
  TRPCLink,
} from './types';

/**
 * The options of `httpSSELink`.
 * @see https://trpc.io/docs/client/links/httpSSELink#options
 */
export type HTTPSSELinkOptions<TRoot extends AnyClientTypes> = Pick<
  HTTPLinkBaseOptions<TRoot>,
  'fetch' | 'methodOverride' | 'pathSeparator'
> &
  TransformerOptions<TRoot> & {
    /**
     * The URL of your tRPC endpoint, such as `http://localhost:3000/trpc`,
     * or a function that returns it. A function runs again on every
     * reconnect.
     */
    url: string | URL | (() => string | URL | Promise<string | URL>);
    /**
     * Headers for each connection: an object, or a function of the operation
     * that returns them. A function runs again on every reconnect, so it can
     * hand out a fresh token.
     * @see https://trpc.io/docs/client/headers
     */
    headers?:
      | HTTPHeaders
      | ((opts: { op: Operation }) => HTTPHeaders | Promise<HTTPHeaders>);
    /**
     * Params for `createContext()`'s `info.connectionParams`, sent in the URL's
     * `connectionParams` query parameter. A function runs again on every
     * reconnect. Prefer `headers` for secrets: URLs end up in logs.
     * @see https://trpc.io/docs/client/links/httpSSELink#connectionParams
     */
    connectionParams?: CallbackOrValue<TRPCRequestInfo['connectionParams']>;
    /**
     * How the link reconnects after a connection fails: a network error, an
     * unparseable error response, or a retryable error such as
     * `INTERNAL_SERVER_ERROR`. A stream the server ends without finishing the
     * subscription (`maxDurationMs`, `emitAndEndImmediately`) reconnects at
     * once and doesn't count as a failure.
     * @see https://trpc.io/docs/client/links/httpSSELink#reconnect
     */
    reconnect?: {
      /**
       * How many failed connections in a row to retry before the
       * subscription errors. Receiving an event resets the count.
       * @default 5
       */
      attempts?: number;
      /**
       * Milliseconds to wait before the `attempt`th retry, starting at 1.
       * @default (attempt) => Math.min(1000 * 2 ** (attempt - 1), 30_000)
       */
      delay?: (attempt: number) => number;
    };
  };

type ClientError = TRPCClientError<any>;
type Result = OperationResultEnvelope<unknown, ClientError>['result'];

/** How one connection ended */
type ConnectionEnd =
  /** The subscription finished on the server */
  | { type: 'return' }
  /** The caller unsubscribed */
  | { type: 'aborted' }
  /** The server ended the stream without finishing the subscription */
  | { type: 'ended' }
  /** Nothing arrived within `reconnectAfterInactivityMs` */
  | { type: 'timeout'; error: ClientError }
  | { type: 'retry'; error: ClientError }
  | { type: 'fatal'; error: ClientError };

/** One SSE event, decoded */
type SSEEvent =
  | { type: 'connected'; options: SSEClientOptions }
  | { type: 'data'; id: string | undefined; data: unknown }
  | { type: 'error'; shape: TRPCErrorShape }
  | { type: 'return' }
  /** `ping` only keeps the connection alive; `restore-id` is for `EventSource` */
  | { type: 'ignored' }
  | { type: 'invalid'; error: ClientError };

// `TRPCClientError.from()` reads any thrown value, whatever its type says
const clientErrorFrom = (cause: unknown) =>
  TRPCClientError.from(cause as Error);

const defaultReconnectDelay = (attempt: number) =>
  Math.min(1000 * 2 ** (attempt - 1), 30_000);

const connecting = (error: ClientError | null): Result => ({
  type: 'state',
  state: 'connecting',
  error,
});

/** Resolves after `ms`, or as soon as `signal` aborts */
function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
    function done() {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
  });
}

/** Calls `onTimeout` once `reset(ms)` isn't called again within `ms` */
function inactivityTimer(onTimeout: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined = undefined;
  return makeResource(
    {
      reset(ms: number | undefined) {
        clearTimeout(timer);
        timer = ms ? setTimeout(onTimeout, ms) : undefined;
      },
    },
    () => clearTimeout(timer),
  );
}

function withConnectionParams(
  url: string,
  params: TRPCRequestInfo['connectionParams'],
) {
  if (!params) {
    return url;
  }
  const prefix = url.includes('?') ? '&' : '?';
  return `${url}${prefix}connectionParams=${encodeURIComponent(JSON.stringify(params))}`;
}

function decodeEvent(
  message: SSEMessage,
  transformer: ResolvedHTTPLinkOptions['transformer'],
): SSEEvent {
  try {
    switch (message.event) {
      case 'connected':
        return {
          type: 'connected',
          options: message.data ? JSON.parse(message.data) : {},
        };
      case 'message':
        return {
          type: 'data',
          // `tracked()` sets an id; the server clears it with `id: ` after
          id: message.id,
          // an empty `data:` line is how the server encodes `undefined`
          data:
            message.data === ''
              ? undefined
              : transformer.output.deserialize(JSON.parse(message.data)),
        };
      case 'serialized-error':
        return {
          type: 'error',
          shape: transformer.output.deserialize(JSON.parse(message.data)),
        };
      case 'return':
        return { type: 'return' };
      default:
        return { type: 'ignored' };
    }
  } catch (cause) {
    return { type: 'invalid', error: clientErrorFrom(cause) };
  }
}

/** The tRPC error in an error response's body, if it has one */
function errorResponseOf(
  json: unknown,
  transformer: ResolvedHTTPLinkOptions['transformer'],
) {
  if (!isObject(json) || !('error' in json)) {
    return null;
  }
  try {
    const transformed = transformResult(json as never, transformer.output);
    return transformed.ok ? null : transformed.error;
  } catch {
    // not a tRPC error, such as a proxy's `{ "error": "Bad gateway" }`
    return null;
  }
}

/** A retryable error carries on with `retry`; any other ends with `fatal` */
const endWith = (
  code: TRPC_ERROR_CODE_NUMBER,
  error: ClientError,
): ConnectionEnd =>
  retryableRpcCodes.includes(code)
    ? { type: 'retry', error }
    : { type: 'fatal', error };

/**
 * A subscription's results, across every connection it takes: it reconnects
 * after a connection ends, from the last tracked event id, until the server
 * finishes the subscription, `signal` aborts, or it fails for good.
 */
async function* subscribe(opts: {
  op: Operation;
  signal: AbortSignal;
  link: HTTPSSELinkOptions<AnyClientTypes>;
  resolved: ResolvedHTTPLinkOptions;
}): AsyncGenerator<Result, void> {
  const { op, signal } = opts;
  const transformer = opts.resolved.transformer;
  const reconnectAttempts = opts.link.reconnect?.attempts ?? 5;
  const reconnectDelay = opts.link.reconnect?.delay ?? defaultReconnectDelay;

  let lastEventId: string | undefined = undefined;
  /** Failed connections in a row */
  let failures = 0;

  /** Sends the request: the response body, or how the connection ended */
  async function open(
    connectionSignal: AbortSignal,
  ): Promise<{ type: 'open'; body: WebReadableStreamEsque } | ConnectionEnd> {
    let res: Awaited<ReturnType<typeof fetchHTTPResponse>>;
    try {
      const [url, params] = await Promise.all([
        resultOf(opts.link.url),
        resultOf(opts.link.connectionParams),
      ]);
      res = await fetchHTTPResponse({
        ...opts.resolved,
        url: withConnectionParams(url.toString(), params ?? null),
        type: op.type,
        path: op.path,
        input: inputWithTrackedEventId(op.input, lastEventId),
        signal: connectionSignal,
        contentTypeHeader: 'application/json',
        getUrl,
        getBody: (bodyOpts) =>
          bodyOpts.methodOverride === 'POST' ? getBody(bodyOpts) : undefined,
        async headers() {
          const headers = opts.link.headers
            ? await resultOf(opts.link.headers, { op })
            : {};
          return {
            accept: 'text/event-stream',
            ...(Symbol.iterator in headers
              ? Object.fromEntries(headers)
              : headers),
          };
        },
      });
    } catch (cause) {
      return signal.aborted
        ? { type: 'aborted' }
        : { type: 'retry', error: clientErrorFrom(cause) };
    }

    if (!res.ok) {
      // a tRPC error response, or something else, such as a proxy's page
      const errorResponse = errorResponseOf(
        await res.json().catch(() => null),
        transformer,
      );
      if (errorResponse) {
        return endWith(
          errorResponse.error.code,
          TRPCClientError.from(errorResponse, { meta: { response: res } }),
        );
      }
      return {
        type: 'retry',
        error: new TRPCClientError(
          'The subscription request failed with an unexpected response',
        ),
      };
    }
    if (!res.body || !('getReader' in res.body)) {
      return {
        type: 'fatal',
        error: new TRPCClientError(
          'httpSSELink needs a `fetch` whose responses have a streaming `body`',
        ),
      };
    }
    return { type: 'open', body: res.body };
  }

  /** One connection's results, returning how it ended */
  async function* connect(): AsyncGenerator<Result, ConnectionEnd> {
    const connectionAc = new AbortController();
    const connection = raceAbortSignalsWithCleanup(signal, connectionAc.signal);
    // however the connection ends, its request closes
    using _connection = makeResource({}, () => {
      connectionAc.abort();
      connection.cleanup();
    });

    const opened = await open(connection.signal);
    if (signal.aborted) {
      // whatever reading a failed response made of the abort
      return { type: 'aborted' };
    }
    if (opened.type !== 'open') {
      return opened;
    }

    let connected = false;
    let inactivityMs: number | undefined = undefined;
    using inactivity = inactivityTimer(() =>
      connectionAc.abort(
        new TRPCClientError(
          `Timeout of ${inactivityMs}ms reached while waiting for a response`,
        ),
      ),
    );

    try {
      const messages = sseMessages(opened.body, {
        signal: connection.signal,
        // any byte, a partial event or a ping, shows the connection is alive
        onRead: () => inactivity.reset(inactivityMs),
      });
      for await (const message of messages) {
        // a chunk can hold more events than the one the caller aborted on
        if (signal.aborted) {
          return { type: 'aborted' };
        }
        const event = decodeEvent(message, transformer);
        switch (event.type) {
          case 'connected':
            connected = true;
            inactivityMs = event.options.reconnectAfterInactivityMs;
            inactivity.reset(inactivityMs);
            yield { type: 'started' };
            yield { type: 'state', state: 'pending', error: null };
            break;
          case 'data': {
            failures = 0;
            let result: TRPCResult<unknown> = { data: event.data };
            if (event.id) {
              // the `tracked()` helper always sets an id
              lastEventId = event.id;
              result = {
                id: event.id,
                data: { id: event.id, data: event.data },
              };
            }
            yield result;
            break;
          }
          case 'error':
            return endWith(
              event.shape.code,
              TRPCClientError.from({ error: event.shape }),
            );
          case 'return':
            return { type: 'return' };
          case 'invalid':
            return { type: 'fatal', error: event.error };
          case 'ignored':
            break;
        }
      }
    } catch (cause) {
      if (signal.aborted) {
        return { type: 'aborted' };
      }
      // only the inactivity timer aborts a connection that's still open
      if (connectionAc.signal.aborted) {
        return { type: 'timeout', error: connectionAc.signal.reason };
      }
      return { type: 'retry', error: clientErrorFrom(cause) };
    }

    return connected
      ? { type: 'ended' }
      : {
          type: 'retry',
          error: new TRPCClientError(
            'The subscription stream ended before connecting',
          ),
        };
  }

  yield connecting(null);
  while (true) {
    const end = yield* connect();
    switch (end.type) {
      case 'aborted':
        return;
      case 'return':
        yield { type: 'stopped' };
        yield { type: 'state', state: 'idle', error: null };
        return;
      case 'fatal':
        throw end.error;
      case 'ended':
        failures = 0;
        yield connecting(null);
        break;
      case 'timeout':
        yield connecting(end.error);
        break;
      case 'retry':
        if (++failures > reconnectAttempts) {
          throw end.error;
        }
        yield connecting(end.error);
        await sleep(reconnectDelay(failures), signal);
        if (signal.aborted) {
          return;
        }
        break;
    }
  }
}

/**
 * A terminating link that runs subscriptions over Server-Sent Events, read
 * with `fetch` instead of `EventSource`: it sends headers, can POST its
 * input, reads error responses, and resumes from the last tracked event id
 * when it reconnects.
 *
 * @see https://trpc.io/docs/client/links/httpSSELink
 */
export function httpSSELink<TInferrable extends InferrableClientTypes>(
  opts: HTTPSSELinkOptions<inferClientTypes<TInferrable>>,
): TRPCLink<TInferrable> {
  // `url` may be a function, so each connection resolves it
  const resolved = resolveHTTPLinkOptions({ ...opts, url: '' });

  return () => {
    return ({ op }) => {
      return observable((observer) => {
        /* istanbul ignore if -- @preserve */
        if (op.type !== 'subscription') {
          throw new Error('httpSSELink only supports subscriptions');
        }

        const ac = new AbortController();
        const { signal, cleanup } = raceAbortSignalsWithCleanup(
          op.signal,
          ac.signal,
        );

        run(async () => {
          for await (const result of subscribe({
            op,
            signal,
            link: opts,
            resolved,
          })) {
            // a parsed chunk can hold more events than the one that aborted
            if (signal.aborted) {
              break;
            }
            observer.next({ result });
          }
          observer.complete();
        }).catch((cause) => {
          observer.error(clientErrorFrom(cause));
        });

        return () => {
          observer.complete();
          ac.abort();
          cleanup();
        };
      });
    };
  };
}
