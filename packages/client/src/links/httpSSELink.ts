import type { TRPCRequestInfo } from '@trpc/server/http';
import { behaviorSubject, observable } from '@trpc/server/observable';
import type { TRPCErrorShape, TRPCResult } from '@trpc/server/rpc';
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
import type { TRPCConnectionState } from '../unstable-internals';
import {
  fetchHTTPResponse,
  getBody,
  getUrl,
  resolveHTTPLinkOptions,
  type HTTPLinkBaseOptions,
} from './internals/httpUtils';
import { createSSEParser, type SSEMessage } from './internals/sseParser';
import {
  resultOf,
  type CallbackOrValue,
} from './internals/urlWithConnectionParams';
import type { HTTPHeaders, Operation, TRPCLink } from './types';

/**
 * The options of `httpSSELink`.
 * @see https://trpc.io/docs/client/links/httpSSELink#options
 */
export type HTTPSSELinkOptions<TRoot extends AnyClientTypes> =
  HTTPLinkBaseOptions<TRoot> & {
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

type ConnectionOutcome =
  /** The subscription finished on the server */
  | { type: 'return' }
  /** The caller unsubscribed */
  | { type: 'aborted' }
  /** The server ended the stream without finishing the subscription */
  | { type: 'ended' }
  /** No bytes arrived within `reconnectAfterInactivityMs` */
  | { type: 'timeout'; ms: number }
  | { type: 'retry'; error: TRPCClientError<any> }
  | { type: 'fatal'; error: TRPCClientError<any> };

// `TRPCClientError.from()` reads any thrown value, whatever its type says
const clientErrorFrom = (cause: unknown) =>
  TRPCClientError.from(cause as Error);

const defaultReconnectDelay = (attempt: number) =>
  Math.min(1000 * 2 ** (attempt - 1), 30_000);

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
  });
}

function withConnectionParams(
  url: string,
  params: TRPCRequestInfo['connectionParams'],
) {
  if (!params) {
    return url;
  }
  const prefix = url.includes('?') ? '&' : '?';
  return (
    url +
    prefix +
    'connectionParams=' +
    encodeURIComponent(JSON.stringify(params))
  );
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
  const resolvedOpts = resolveHTTPLinkOptions(opts);
  const transformer = resolvedOpts.transformer;
  const reconnectAttempts = opts.reconnect?.attempts ?? 5;
  const reconnectDelay = opts.reconnect?.delay ?? defaultReconnectDelay;

  return () => {
    return ({ op }) => {
      return observable((observer) => {
        const { type, path, input } = op;

        /* istanbul ignore if -- @preserve */
        if (type !== 'subscription') {
          throw new Error('httpSSELink only supports subscriptions');
        }

        const ac = new AbortController();
        const { signal, cleanup: cleanupSignal } = raceAbortSignalsWithCleanup(
          op.signal,
          ac.signal,
        );

        let lastEventId: string | undefined = undefined;
        /** Failed connections in a row */
        let attempt = 0;

        const connectionState = behaviorSubject<
          TRPCConnectionState<TRPCClientError<any>>
        >({
          type: 'state',
          state: 'connecting',
          error: null,
        });
        const connectionSub = connectionState.subscribe({
          next(state) {
            observer.next({ result: state });
          },
        });

        const deserializeData = (data: string) =>
          // An empty `data:` line is how the server encodes `undefined`
          data === ''
            ? undefined
            : transformer.output.deserialize(JSON.parse(data));

        async function readResponse(
          body: WebReadableStreamEsque,
          connectionSignal: AbortSignal,
        ): Promise<ConnectionOutcome> {
          const reader = body.getReader();
          const decoder = new TextDecoder();

          let outcome: ConnectionOutcome | null = null;
          let connected = false;
          let inactivityMs: number | undefined = undefined;
          let timedOut = false;
          let timer: ReturnType<typeof setTimeout> | undefined = undefined;

          const cancel = () => {
            reader.cancel().catch(() => {
              // the stream is already errored or closed
            });
          };
          connectionSignal.addEventListener('abort', cancel, { once: true });
          using _reader = makeResource({}, () => {
            clearTimeout(timer);
            connectionSignal.removeEventListener('abort', cancel);
            cancel();
          });

          const resetTimer = () => {
            clearTimeout(timer);
            if (inactivityMs) {
              timer = setTimeout(() => {
                timedOut = true;
                cancel();
              }, inactivityMs);
            }
          };

          const onMessage = (message: SSEMessage) => {
            switch (message.event) {
              case 'connected': {
                connected = true;
                const options: SSEClientOptions = message.data
                  ? JSON.parse(message.data)
                  : {};
                inactivityMs = options.reconnectAfterInactivityMs;
                observer.next({ result: { type: 'started' } });
                connectionState.next({
                  type: 'state',
                  state: 'pending',
                  error: null,
                });
                return;
              }
              case 'message': {
                attempt = 0;
                const data = deserializeData(message.data);
                let result: TRPCResult<unknown>;
                if (message.id) {
                  // the `tracked()` helper always sets an id
                  lastEventId = message.id;
                  result = { id: message.id, data: { id: message.id, data } };
                } else {
                  result = { data };
                }
                observer.next({ result });
                return;
              }
              case 'serialized-error': {
                const shape = transformer.output.deserialize(
                  JSON.parse(message.data),
                ) as TRPCErrorShape;
                const error = TRPCClientError.from({ error: shape });
                outcome = retryableRpcCodes.includes(shape.code)
                  ? { type: 'retry', error }
                  : { type: 'fatal', error };
                return;
              }
              case 'return':
                outcome = { type: 'return' };
                return;
              // `ping` only keeps the connection alive, and `restore-id` is
              // for `EventSource`
            }
          };
          const parser = createSSEParser((message) => {
            if (outcome) {
              return;
            }
            try {
              onMessage(message);
            } catch (cause) {
              outcome = { type: 'fatal', error: clientErrorFrom(cause) };
            }
          });

          let readError: { cause: unknown } | null = null;
          while (!outcome) {
            let chunk: ReadableStreamReadResult<Uint8Array>;
            try {
              chunk = await reader.read();
            } catch (cause) {
              readError = { cause };
              break;
            }
            if (chunk.done) {
              break;
            }
            parser.push(decoder.decode(chunk.value, { stream: true }));
            // after parsing: the first chunk's `connected` sets the timeout
            resetTimer();
          }

          if (outcome) {
            return outcome;
          }
          if (signal.aborted) {
            return { type: 'aborted' };
          }
          if (timedOut && inactivityMs) {
            return { type: 'timeout', ms: inactivityMs };
          }
          if (connected && !readError) {
            return { type: 'ended' };
          }
          return {
            type: 'retry',
            error: clientErrorFrom(
              readError
                ? readError.cause
                : new Error('The subscription stream ended before connecting'),
            ),
          };
        }

        async function connect(): Promise<ConnectionOutcome> {
          const connectionAc = new AbortController();
          const connection = raceAbortSignalsWithCleanup(
            signal,
            connectionAc.signal,
          );
          // ending a connection, for any reason, closes its request
          using _connection = makeResource({}, () => {
            connectionAc.abort();
            connection.cleanup();
          });

          let res: Awaited<ReturnType<typeof fetchHTTPResponse>>;
          try {
            const params = await resultOf(opts.connectionParams);
            res = await fetchHTTPResponse({
              ...resolvedOpts,
              url: withConnectionParams(resolvedOpts.url, params ?? null),
              type,
              path,
              input: inputWithTrackedEventId(input, lastEventId),
              signal: connection.signal,
              contentTypeHeader: 'application/json',
              getUrl,
              getBody: (bodyOpts) =>
                bodyOpts.methodOverride === 'POST'
                  ? getBody(bodyOpts)
                  : undefined,
              async headers() {
                const headers = opts.headers
                  ? await resultOf(opts.headers, { op })
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
            if (signal.aborted) {
              return { type: 'aborted' };
            }
            return { type: 'retry', error: clientErrorFrom(cause) };
          }

          if (!res.ok) {
            const json = await res.json().catch(() => null);
            if (isObject(json) && 'error' in json) {
              const transformed = transformResult(
                json as never,
                transformer.output,
              );
              if (!transformed.ok) {
                const error = TRPCClientError.from(transformed.error, {
                  meta: { response: res },
                });
                return retryableRpcCodes.includes(transformed.error.error.code)
                  ? { type: 'retry', error }
                  : { type: 'fatal', error };
              }
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

          return await readResponse(res.body, connection.signal);
        }

        run(async () => {
          let delayMs = 0;
          while (true) {
            if (delayMs > 0) {
              await sleep(delayMs, signal);
            }
            if (signal.aborted) {
              return;
            }
            const outcome = await connect();
            switch (outcome.type) {
              case 'aborted':
                return;
              case 'return': {
                observer.next({ result: { type: 'stopped' } });
                connectionState.next({
                  type: 'state',
                  state: 'idle',
                  error: null,
                });
                observer.complete();
                return;
              }
              case 'fatal':
                throw outcome.error;
              case 'ended':
                attempt = 0;
                delayMs = 0;
                connectionState.next({
                  type: 'state',
                  state: 'connecting',
                  error: null,
                });
                break;
              case 'timeout':
                delayMs = 0;
                connectionState.next({
                  type: 'state',
                  state: 'connecting',
                  error: new TRPCClientError(
                    `Timeout of ${outcome.ms}ms reached while waiting for a response`,
                  ),
                });
                break;
              case 'retry': {
                attempt++;
                if (attempt > reconnectAttempts) {
                  throw outcome.error;
                }
                delayMs = reconnectDelay(attempt);
                connectionState.next({
                  type: 'state',
                  state: 'connecting',
                  error: outcome.error,
                });
                break;
              }
            }
          }
        }).catch((error) => {
          observer.error(TRPCClientError.from(error));
        });

        return () => {
          observer.complete();
          ac.abort();
          cleanupSignal();
          connectionSub.unsubscribe();
        };
      });
    };
  };
}
