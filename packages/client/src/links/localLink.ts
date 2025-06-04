// import "server-only";

import type { TRPCLink } from '@trpc/client';
import { TRPCClientError } from '@trpc/client';
import type { TRPCConnectionState } from '@trpc/client/unstable-internals';
import {
  getTransformer,
  type TransformerOptions,
} from '@trpc/client/unstable-internals';
import { getTRPCErrorFromUnknown, isTrackedEnvelope } from '@trpc/server';
import { behaviorSubject, observable } from '@trpc/server/observable';
import { TRPC_ERROR_CODES_BY_KEY, type TRPCResult } from '@trpc/server/rpc';
import type {
  AnyRouter,
  ErrorHandlerOptions,
  inferClientTypes,
  inferRouterContext,
} from '@trpc/server/unstable-core-do-not-import';
import {
  callProcedure,
  isAbortError,
  isAsyncIterable,
  iteratorResource,
  makeResource,
  retryableRpcCodes,
  run,
} from '@trpc/server/unstable-core-do-not-import';
import { inputWithTrackedEventId } from '../internals/inputWithTrackedEventId';
import { abortSignalToPromise, raceAbortSignals } from '../internals/signals';

export type LocalLinkOptions<TRouter extends AnyRouter> = {
  router: TRouter;
  createContext: () => Promise<inferRouterContext<TRouter>>;
  onError?: (opts: ErrorHandlerOptions<inferRouterContext<TRouter>>) => void;
} & TransformerOptions<inferClientTypes<TRouter>>;

// ts-prune-ignore-next
export function localLink<TRouter extends AnyRouter>(
  opts: LocalLinkOptions<TRouter>,
): TRPCLink<TRouter> {
  const transformer = getTransformer(opts.transformer);

  const handleChunk = (chunk: unknown) => {
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

        const runProcedure = async (input: unknown) => {
          ctx = await opts.createContext();

          return callProcedure({
            router: opts.router,
            path: op.path,
            getRawInput: async () => input,
            ctx,
            type: op.type,
            signal,
          });
        };
        run(async () => {
          switch (op.type) {
            case 'query':
            case 'mutation':
              const result = await runProcedure(op.input);
              if (!isAsyncIterable(result)) {
                observer.next({
                  result: { data: handleChunk(result) },
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
                          return handleChunk(res.value);
                        }
                        yield handleChunk(res.value);
                      }
                    } catch (cause) {
                      if (!isAbortError(cause)) {
                        opts.onError?.({
                          error: getTRPCErrorFromUnknown(cause),
                          type: op.type,
                          path: op.path,
                          input: op.input,
                          ctx,
                        });
                      }
                      throw cause;
                    }
                  })(),
                },
              });
              break;
            case 'subscription':
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
                      retryableRpcCodes.includes(
                        TRPC_ERROR_CODES_BY_KEY[error.code],
                      )
                    ) {
                      opts.onError?.({
                        error,
                        type: op.type,
                        path: op.path,
                        input: op.input,
                        ctx,
                      });
                      connectionState.next({
                        type: 'state',
                        state: 'connecting',
                        error: TRPCClientError.from(error),
                      });
                    } else {
                      throw error;
                    }

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
                      data: handleChunk(chunk.data),
                    },
                  });
                }
              }

              break;
          }
        }).catch((cause) => {
          opts.onError?.({
            error: getTRPCErrorFromUnknown(cause),
            type: op.type,
            path: op.path,
            input: op.input,
            ctx,
          });
          observer.error(TRPCClientError.from(cause));
        });

        return () => {
          ac.abort();
          // noop
        };
      });
}
