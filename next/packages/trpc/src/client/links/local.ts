import { Context, Effect, ManagedRuntime, Stream, type Layer } from 'effect';
import {
  fromWireError,
  isTrpcError,
  streamErrors,
  toWireError,
  TrpcError,
} from '../../internal/error.ts';
import type {
  DansonForm,
  FormOfSerializer,
  MaybePromise,
} from '../../internal/types.ts';
import { jsonSerializer, type AnySerializer } from '../../serializer/index.ts';
import {
  callProcedure,
  normalizeCause,
  unexpectedError,
} from '../../server/execute.ts';
import {
  resolveProcedure,
  type AnyRouter,
  type inferRouterContext,
} from '../../server/router.ts';
import { link, withSerializer, type TrpcLink } from '../link.ts';

/**
 * Options for {@link localLink}.
 * @since 0.1.0
 * @stability stable
 */
export interface LocalLinkOptions<TRouter extends AnyRouter> {
  router: TRouter;
  /** Runs once per call. */
  createContext?: () => MaybePromise<inferRouterContext<TRouter>>;
  /** Provides the Effect services the router needs. */
  layer?: Layer.Layer<never, any, never> | undefined;
  /**
   * Round-trip inputs and outputs through a serializer, as over the wire.
   * `false` passes values by reference, with native types.
   * @default jsonSerializer
   */
  serializer?: AnySerializer | false;
}

/**
 * Runs calls in-process, without HTTP. For tests and SSR.
 *
 * @example
 * ```ts
 * const client = createTrpcClient({
 *   router: routerType<AppRouter>(),
 *   links: [localLink({ router: appRouter, createContext: () => ({ user }) })],
 * });
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function localLink<
  TRouter extends AnyRouter,
  TSerializer extends AnySerializer | false | undefined = undefined,
>(
  opts: LocalLinkOptions<TRouter> & { serializer?: TSerializer },
): TrpcLink<{
  form: TSerializer extends false ? DansonForm : FormOfSerializer<TSerializer>;
}>;
export function localLink<TRouter extends AnyRouter>(
  opts: LocalLinkOptions<TRouter>,
): TrpcLink<any> {
  const serializer =
    opts.serializer === false ? undefined : (opts.serializer ?? jsonSerializer);
  const layer = opts.layer as Layer.Layer<any, any, never> | undefined;
  const runtime = layer ? ManagedRuntime.make(layer) : undefined;
  let services: Promise<Context.Context<any>> | undefined;
  const getServices = () =>
    (services ??= runtime
      ? runtime.context()
      : Promise.resolve(Context.empty() as Context.Context<any>));
  const roundtrip = (value: unknown, input?: boolean) => {
    if (!serializer) return value;
    const parts: Blob[] | undefined = input ? [] : undefined;
    return serializer.deserialize(serializer.serialize(value, { parts }), {
      input,
      parts,
    });
  };

  return withSerializer(
    link(({ op }) =>
      Stream.unwrap(
        Effect.gen(function* () {
          const procedure = yield* Effect.promise(async () =>
            resolveProcedure(opts.router, op.path),
          );
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
          const serialized = serializer.serializeDeferred(data, {
            coerceError: (cause) =>
              toWireError(isTrpcError(cause) ? cause : unexpectedError(cause)),
          });
          return Stream.fromEffect(
            serializer.deserializeStream(
              serialized.chunks
                ? Stream.concat(Stream.make(serialized.head), serialized.chunks)
                : Stream.make(serialized.head),
              {
                reviveError: (value) => fromWireError(value),
                ...streamErrors,
              },
            ),
          );
        }),
      ).pipe(Stream.catchCause((cause) => Stream.fail(normalizeCause(cause)))),
    ),
    serializer,
  );
}
