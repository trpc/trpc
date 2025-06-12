import {
  getTRPCErrorFromUnknown,
  getTRPCErrorShape,
  isTrackedEnvelope,
} from '@trpc/server';
import { behaviorSubject, observable } from '@trpc/server/observable';
import { TRPC_ERROR_CODES_BY_KEY, type TRPCResult } from '@trpc/server/rpc';
import {
  callProcedure,
  isAbortError,
  isAsyncIterable,
  iteratorResource,
  makeResource,
  retryableRpcCodes,
  run,
  type AnyRouter,
  type ErrorHandlerOptions,
  type inferClientTypes,
  type inferRouterContext,
} from '@trpc/server/unstable-core-do-not-import';
import { inputWithTrackedEventId } from '../internals/inputWithTrackedEventId';
import { abortSignalToPromise, raceAbortSignals } from '../internals/signals';
import { getTransformer } from '../internals/transformer';
import type { TransformerOptions } from '../internals/transformer';
import { isTRPCClientError, TRPCClientError } from '../TRPCClientError';
import type { TRPCConnectionState } from './internals/subscriptions';
import type { TRPCLink } from './types';

export type LocalLinkOptions<TRouter extends AnyRouter> = {
  router: TRouter;
  createContext: () => Promise<inferRouterContext<TRouter>>;
  onError?: (opts: ErrorHandlerOptions<inferRouterContext<TRouter>>) => void;
} & TransformerOptions<inferClientTypes<TRouter>>;

/**
 * localLink is a terminating link that allows you to make tRPC procedure calls directly in your application without going through HTTP.
 *
 * @see https://trpc.io/docs/links/localLink
 */
export function unstable_localLink<TRouter extends AnyRouter>(
  opts: LocalLinkOptions<TRouter>,
): TRPCLink<TRouter> {
  const transformer = getTransformer(opts.transformer);

  const transformChunk = (chunk: unknown) => {
    if (opts.transformer) {
      // assume transformer will do the right thing
      return chunk;
    }
    // Special case for undefined, because `JSON.stringify(undefined)` throws
    if (chunk === undefined) {
      return chunk;
    }
    const serialized = JSON.stringify(transformer.input.serialize(chunk));
    const deserialized = JSON.parse(transformer.output.deserialize(serialized));
    return deserialized;
  };

  return () =>
    ({ op }) =>
      observable((observer) => {
        let ctx: inferRouterContext<TRouter> | undefined = undefined;
        const ac = new AbortController();

        const signal = raceAbortSignals(op.signal, ac.signal);
        const signalPromise = abortSignalToPromise(signal);

        signalPromise.catch(() => {
          // prevent unhandled rejection
        });

        let input = op.input;
        async function runProcedure(newInput: unknown): Promise<unknown> {
          input = newInput;

          ctx = await opts.createContext();

          return callProcedure({
            router: opts.router,
            path: op.path,
            getRawInput: async () => newInput,
            ctx,
            type: op.type,
            signal,
          });
        }

        function onErrorCallback(cause: unknown) {
          if (isAbortError(cause)) {
            return;
          }
          opts.onError?.({
            error: getTRPCErrorFromUnknown(cause),
            type: op.type,
            path: op.path,
            input,
            ctx,
          });
        }

        function coerceToTRPCClientError(cause: unknown) {
          if (isTRPCClientError<TRouter>(cause)) {
            return cause;
          }
          const error = getTRPCErrorFromUnknown(cause);

          const shape = getTRPCErrorShape({
            config: opts.router._def._config,
            ctx,
            error,
            input,
            path: op.path,
            type: op.type,
          });
          return TRPCClientError.from({
            error: transformChunk(shape),
          });
        }

        run(async () => {
          switch (op.type) {
            case 'query':
            case 'mutation': {
              const result = await runProcedure(op.input);
              if (!isAsyncIterable(result)) {
                observer.next({
                  result: { data: transformChunk(result) },
                });
                observer.complete();
                break;
              }

              observer.next({
                result: {
                  data: (async function* () {
                    await using iterator = iteratorResource(result);
                    using _finally = makeResource({}, () => {
                      observer.complete();
                    });
                    try {
                      while (true) {
                        const res = await Promise.race([
                          iterator.next(),
                          signalPromise,
                        ]);
                        if (res.done) {
                          return transformChunk(res.value);
                        }
                        yield transformChunk(res.value);
                      }
                    } catch (cause) {
                      onErrorCallback(cause);
                      throw coerceToTRPCClientError(cause);
                    }
                  })(),
                },
              });
              break;
            }
            case 'subscription': {
              const connectionState = behaviorSubject<
                TRPCConnectionState<TRPCClientError<any>>
              >({
                type: 'state',
                state: 'connecting',
                error: null,
              });

              const connectionSub = connectionState.subscribe({
                next(state) {
                  observer.next({
                    result: state,
                  });
                },
              });
              let lastEventId: string | undefined = undefined;

              using _finally = makeResource({}, async () => {
                observer.complete();

                connectionState.next({
                  type: 'state',
                  state: 'idle',
                  error: null,
                });
                connectionSub.unsubscribe();
              });
              while (true) {
                const result = await runProcedure(
                  inputWithTrackedEventId(op.input, lastEventId),
                );
                if (!isAsyncIterable(result)) {
                  throw new Error('Expected an async iterable');
                }
                await using iterator = iteratorResource(result);

                observer.next({
                  result: {
                    type: 'started',
                  },
                });
                connectionState.next({
                  type: 'state',
                  state: 'pending',
                  error: null,
                });

                // Use a while loop to handle errors and reconnects
                while (true) {
                  let res;
                  try {
                    res = await Promise.race([iterator.next(), signalPromise]);
                  } catch (cause) {
                    if (isAbortError(cause)) {
                      return;
                    }
                    const error = getTRPCErrorFromUnknown(cause);

                    if (
                      !retryableRpcCodes.includes(
                        TRPC_ERROR_CODES_BY_KEY[error.code],
                      )
                    ) {
                      throw coerceToTRPCClientError(error);
                    }

                    onErrorCallback(error);
                    connectionState.next({
                      type: 'state',
                      state: 'connecting',
                      error: coerceToTRPCClientError(error),
                    });

                    break;
                  }

                  if (res.done) {
                    return;
                  }
                  let chunk: TRPCResult<unknown>;
                  if (isTrackedEnvelope(res.value)) {
                    lastEventId = res.value[0];

                    chunk = {
                      id: res.value[0],
                      data: {
                        id: res.value[0],
                        data: res.value[1],
                      },
                    };
                  } else {
                    chunk = {
                      data: res.value,
                    };
                  }

                  observer.next({
                    result: {
                      ...chunk,
                      data: transformChunk(chunk.data),
                    },
                  });
                }
              }
              break;
            }
          }
        }).catch((cause) => {
          onErrorCallback(cause);
          observer.error(coerceToTRPCClientError(cause));
        });

        return () => {
          ac.abort();
        };
      });
}
/**
 * @deprecated Renamed to `unstable_localLink`. This alias will be removed in a future major release.
 */
export const experimental_localLink: typeof unstable_localLink =
  unstable_localLink;
