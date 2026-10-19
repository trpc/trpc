import { Effect, Stream, type ManagedRuntime } from 'effect';
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
  runtimeServices,
  unexpectedError,
} from '../../server/execution/index.ts';
import type { RuntimeOption } from '../../server/handler/index.ts';
import {
  resolveProcedureEffect,
  type AnyRouter,
  type inferRouterContext,
  type inferRouterServices,
} from '../../server/procedures/index.ts';
import { link, withSerializer, type TrpcLink } from '../link.ts';
import { isByteStreamInput } from './events.ts';

/**
 * Options for {@link localLink}.
 * @since 0.1.0
 * @stability stable
 */
export type LocalLinkOptions<TRouter extends AnyRouter> = {
  router: TRouter;
  /**
   * Round-trip inputs and outputs through a serializer, as over the wire.
   * `false` passes values by reference, with native types.
   * @default jsonSerializer
   */
  serializer?: AnySerializer | false;
} & LocalContextOption<inferRouterContext<TRouter>> &
  RuntimeOption<inferRouterServices<TRouter>>;

/** `createContext` is required when the router's procedures need a `ctx`. */
type LocalContextOption<TCtx> = {} extends TCtx
  ? {
      /** Runs once per call. */
      createContext?: () => MaybePromise<TCtx>;
    }
  : {
      /** Runs once per call. */
      createContext: () => MaybePromise<TCtx>;
    };

/**
 * Runs calls in-process, without HTTP. For tests and SSR. The router's
 * Effect services come from `runtime`, which the caller owns and disposes.
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
  const services = runtimeServices(
    (opts as { runtime?: ManagedRuntime.ManagedRuntime<never, unknown> })
      .runtime,
  );
  const roundtrip = (value: unknown, input?: boolean) => {
    // A byte stream input is the request body over HTTP, not serialized.
    if (!serializer || (input && isByteStreamInput(value))) return value;
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
          const procedure = yield* resolveProcedureEffect(opts.router, op.path);
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
          const context = yield* services;
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
