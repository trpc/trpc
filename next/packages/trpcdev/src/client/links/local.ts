import { Context, Effect, ManagedRuntime, Stream, type Layer } from 'effect';
import {
  fromWireError,
  isTrpcError,
  toWireError,
  TrpcError,
} from '../../internal/error.ts';
import type { MaybePromise } from '../../internal/types.ts';
import { defaultSerializer, type Serializer } from '../../serializer/index.ts';
import {
  callProcedure,
  normalizeCause,
  unexpectedError,
} from '../../server/execute.ts';
import {
  getProcedure,
  type AnyRouter,
  type inferRouterContext,
} from '../../server/router.ts';
import { link, type TrpcLink } from '../link.ts';

/**
 * Options for {@link localLink}.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface LocalLinkOptions<TRouter extends AnyRouter> {
  router: TRouter;
  /** Runs once per call. */
  createContext?: () => MaybePromise<inferRouterContext<TRouter>>;
  /** Provides the Effect services the router needs. */
  layer?: Layer.Layer<any, any, never>;
  /**
   * Round-trip inputs and outputs through a serializer, as over the wire.
   * `false` passes values by reference.
   * @default defaultSerializer
   */
  serializer?: Serializer | false;
}

/**
 * Runs calls in-process, without HTTP. For tests and SSR.
 *
 * @example
 * ```ts
 * const client = createTrpcClient<AppRouter>({
 *   links: [localLink({ router: appRouter, createContext: () => ({ user }) })],
 * });
 * ```
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export function localLink<TRouter extends AnyRouter>(
  opts: LocalLinkOptions<TRouter>,
): TrpcLink {
  const serializer =
    opts.serializer === false
      ? undefined
      : (opts.serializer ?? defaultSerializer);
  const runtime = opts.layer ? ManagedRuntime.make(opts.layer) : undefined;
  let services: Promise<Context.Context<any>> | undefined;
  const getServices = () =>
    (services ??= runtime
      ? runtime.context()
      : Promise.resolve(Context.empty() as Context.Context<any>));
  const roundtrip = (value: unknown, input?: boolean) =>
    serializer
      ? serializer.deserialize(serializer.serialize(value), { input })
      : value;

  return link.effect(({ op }) =>
    Stream.unwrap(
      Effect.gen(function* () {
        const procedure = getProcedure(opts.router, op.path);
        if (!procedure) {
          return yield* Effect.fail(
            new TrpcError({
              code: 'NOT_FOUND',
              message: `No procedure at path "${op.path}"`,
            }),
          );
        }
        if (procedure['~trpc'].type !== op.type) {
          return yield* Effect.fail(
            new TrpcError({
              code: 'METHOD_NOT_SUPPORTED',
              message: `"${op.path}" is a ${procedure['~trpc'].type}, not a ${op.type}`,
            }),
          );
        }
        const context = yield* Effect.promise(getServices);
        const ctx = yield* Effect.promise(
          async () => (await opts.createContext?.()) ?? {},
        );
        const data = yield* callProcedure({
          procedure,
          path: op.path,
          ctx,
          input: roundtrip(op.input, true),
          signal: op.signal ?? new AbortController().signal,
          lastEventId: op.lastEventId,
        }).pipe(Effect.provideContext(context));

        if (op.type === 'subscription') {
          return Stream.map(data as Stream.Stream<unknown>, (event) =>
            roundtrip(event),
          );
        }
        if (!serializer) return Stream.make(data);
        const { head, chunks } = serializer.serializeDeferred(data, {
          coerceError: (cause) =>
            toWireError(isTrpcError(cause) ? cause : unexpectedError(cause)),
        });
        return Stream.fromEffect(
          serializer.deserializeStream(
            chunks
              ? Stream.concat(Stream.make(head), chunks)
              : Stream.make(head),
            { reviveError: (value) => fromWireError(value) },
          ),
        );
      }),
    ).pipe(Stream.catchCause((cause) => Stream.fail(normalizeCause(cause)))),
  );
}
