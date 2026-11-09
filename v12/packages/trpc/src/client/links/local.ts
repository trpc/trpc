import { Effect, Fiber, Stream, type ManagedRuntime } from 'effect';
import {
  fromWireError,
  isTrpcError,
  streamErrors,
  toWireError,
  TrpcError,
} from '../../internal/error.ts';
import type {
  ProgressiveJsonForm,
  FormOfTransformer,
  MaybePromise,
} from '../../internal/types.ts';
import {
  jsonTransformer,
  type AnyTransformer,
} from '../../transformer/index.ts';
import {
  callProcedure,
  createResponseHandle,
  inProcessOutput,
  normalizeCause,
  runtimeServices,
  unexpectedError,
} from '../../server/execution/index.ts';
import type { RuntimeOption } from '../../server/handler/index.ts';
import {
  resolveProcedure,
  type AnyRouter,
  type inferRouterContext,
  type RootRouterCheck,
  type inferRouterServices,
} from '../../server/procedures/index.ts';
import { link, withTransformer, type TrpcLink } from '../link.ts';
import { isByteStreamInput } from './events.ts';

/**
 * Options for {@link localLink}.
 * @since 0.1.0
 * @stability stable
 */
export type LocalLinkOptions<TRouter extends AnyRouter> = {
  router: TRouter & RootRouterCheck<TRouter>;
  /**
   * Round-trip inputs and outputs through a transformer, as over the wire.
   * `false` passes values by reference, with native types.
   * @default jsonTransformer
   */
  transformer?: AnyTransformer | false;
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
 * Runs `f` on its own fiber with a signal that aborts if the caller is
 * interrupted before `f` ends; a streamed output read after it ends isn't cut.
 */
const withSignal = <A, E>(
  f: (signal: AbortSignal) => Effect.Effect<A, E>,
): Effect.Effect<A, E> =>
  Effect.withFiber((parent) =>
    Effect.callback<A, E>((resume, signal) => {
      const fiber = Effect.runForkWith(parent.context)(f(signal));
      fiber.addObserver(resume);
      return Fiber.interrupt(fiber);
    }),
  );

/**
 * Runs calls in-process, without HTTP. For tests and SSR. The router's
 * Effect services come from `runtime`, which the caller owns and disposes.
 * A procedure that returns a response gives the web `Response` an
 * unbatched HTTP call would get, never serialized.
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
  TTransformer extends AnyTransformer | false | undefined = undefined,
>(
  opts: LocalLinkOptions<TRouter> & { transformer?: TTransformer },
): TrpcLink<{
  form: TTransformer extends false
    ? ProgressiveJsonForm
    : FormOfTransformer<TTransformer>;
}>;
export function localLink<TRouter extends AnyRouter>(
  opts: LocalLinkOptions<TRouter>,
): TrpcLink<any> {
  const transformer =
    opts.transformer === false
      ? undefined
      : (opts.transformer ?? jsonTransformer);
  const services = runtimeServices(
    (opts as { runtime?: ManagedRuntime.ManagedRuntime<never, unknown> })
      .runtime,
  );
  const roundtrip = (value: unknown, input?: boolean) => {
    // A byte stream input is the request body over HTTP, not serialized.
    if (!transformer || (input && isByteStreamInput(value))) return value;
    const parts: Blob[] | undefined = input ? [] : undefined;
    return transformer.deserialize(transformer.serialize(value, { parts }), {
      input,
      parts,
    });
  };

  return withTransformer(
    link(({ op }) =>
      Stream.unwrap(
        Effect.gen(function* () {
          const procedure = yield* resolveProcedure(opts.router, op.path);
          if (!procedure) {
            return yield* Effect.fail(
              new TrpcError({
                code: 'NOT_FOUND',
                tag: 'ProcedureNotFound',
                message: `No procedure at path "${op.path}"`,
              }),
            );
          }
          if (procedure['~trpc'].type !== op.type) {
            return yield* Effect.fail(
              new TrpcError({
                code: 'METHOD_NOT_SUPPORTED',
                tag: 'ProcedureTypeMismatch',
                message: `"${op.path}" is a ${procedure['~trpc'].type}, not a ${op.type}`,
              }),
            );
          }
          const context = yield* services;
          const ctx = yield* Effect.promise(
            async () => (await opts.createContext?.()) ?? {},
          );
          const response = createResponseHandle();
          const data = yield* withSignal((interrupted) =>
            callProcedure({
              procedure,
              path: op.path,
              ctx,
              input: roundtrip(op.input, true),
              signal: op.signal
                ? AbortSignal.any([op.signal, interrupted])
                : interrupted,
              lastEventId: op.lastEventId,
              response,
              allowResponse: true,
            }).pipe(
              Effect.flatMap((value) => inProcessOutput(value, response)),
              Effect.provideContext(context),
            ),
          );

          if (op.type === 'subscription') {
            return Stream.map(data as Stream.Stream<unknown>, (event) =>
              roundtrip(event),
            );
          }
          if (
            !transformer ||
            (typeof globalThis.Response === 'function' &&
              data instanceof globalThis.Response)
          ) {
            return Stream.make(data);
          }
          const serialized = transformer.serializeDeferred(data, {
            coerceError: (cause) =>
              toWireError(isTrpcError(cause) ? cause : unexpectedError(cause)),
          });
          return Stream.fromEffect(
            transformer.deserializeStream(
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
    transformer,
  );
}
