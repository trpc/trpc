import { Cause, Effect, Exit, type Layer, type ManagedRuntime } from 'effect';
import { createTrpcClient } from '../client/client.ts';
import { localLink, type LocalLinkOptions } from '../client/links/index.ts';
import { routerType, type TrpcClient } from '../client/types.ts';
import { interruptSignal } from '../internal/effects.ts';
import { abortedError, frameworkError } from '../internal/error.ts';
import type {
  ProgressiveJsonForm,
  MaybePromise,
  ProcedureResponse,
} from '../internal/types.ts';
import {
  callProcedure,
  createResponseHandle,
  inProcessOutput,
  normalizeCause,
  runtimeServices,
} from './execution/index.ts';
import type { RuntimeOption } from './handler/index.ts';
import {
  checkRouterKeys,
  type DefCtx,
  type DefServices,
  type AnyProcedure,
  type ProcedureDef,
  type ProcedureDefOf,
  type AnyRouter,
  type inferRouterContext,
  type inferRouterServices,
} from './procedures/index.ts';

type CtxOption<TCtx> = {} extends TCtx
  ? { ctx?: TCtx | (() => MaybePromise<TCtx>) }
  : { ctx: TCtx | (() => MaybePromise<TCtx>) };

type Runtime<TServices> = ManagedRuntime.ManagedRuntime<TServices, unknown>;

/** A `layer` built for the call, or a caller-owned `runtime`. */
type CallServicesOption<TServices> = [TServices] extends [never]
  ? {
      layer?: Layer.Layer<never, any, never>;
      runtime?: Runtime<never> | undefined;
    }
  :
      | { layer: Layer.Layer<TServices, any, never>; runtime?: undefined }
      | { runtime: Runtime<TServices>; layer?: undefined };

/**
 * Options for {@link createRouterClient}.
 * @since 0.1.0
 * @stability stable
 */
export type RouterClientOptions<TRouter extends AnyRouter> = CtxOption<
  inferRouterContext<TRouter>
> &
  RuntimeOption<inferRouterServices<TRouter>>;

/**
 * Calls a router in-process with the same shape as the HTTP client. Values
 * are passed by reference, not serialized. The router's Effect services
 * come from `runtime`, which the caller owns: make it once with
 * `ManagedRuntime.make(layer)` and dispose it when done.
 *
 * @example
 * ```ts
 * const caller = createRouterClient(appRouter, { ctx: { user } });
 * const post = await caller.post.byId.query({ id: '1' });
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function createRouterClient<TRouter extends AnyRouter>(
  router: TRouter,
  ...[opts]: {} extends RouterClientOptions<TRouter>
    ? [opts?: RouterClientOptions<TRouter>]
    : [opts: RouterClientOptions<TRouter>]
): TrpcClient<TRouter, {}, ProgressiveJsonForm, { builtinErrors: never }> {
  checkRouterKeys(router);
  const o = (opts ?? {}) as {
    ctx?: object | (() => MaybePromise<object>);
    runtime?: Runtime<never>;
  };
  const ctx = o.ctx;
  return createTrpcClient({
    router: routerType<TRouter>(),
    links: [
      localLink({
        router,
        runtime: o.runtime,
        transformer: false,
        createContext: (typeof ctx === 'function'
          ? ctx
          : () => ctx ?? {}) as () => never,
      } as LocalLinkOptions<TRouter> & { transformer: false }),
    ],
  }) as TrpcClient<TRouter, {}, ProgressiveJsonForm, { builtinErrors: never }>;
}

/**
 * The options of {@link call}. `ctx` is required when the procedure needs
 * any, and `layer` or `runtime` when it needs Effect services; otherwise
 * the options can be left out.
 * @since 0.1.0
 * @stability stable
 */
export type CallOptions<TDef extends ProcedureDef> = ({} extends DefCtx<TDef>
  ? { ctx?: DefCtx<TDef> }
  : { ctx: DefCtx<TDef> }) & {
  signal?: AbortSignal;
  /** Passed to middleware and the resolver. @default '' */
  path?: string;
} & CallServicesOption<DefServices<TDef>>;

/** A returned `HttpServerResponse` reaches {@link call}'s caller as a web `Response`. */
type CallOutput<T> = [Extract<T, ProcedureResponse>] extends [never]
  ? T
  : Exclude<T, ProcedureResponse> | globalThis.Response;

/**
 * Calls one procedure directly. Throws the procedure's `TrpcError`s. A
 * `layer` is built for the call and released once it returns, before a
 * streamed output is read; pass a caller-owned `runtime` for those. A
 * returned response arrives as the web `Response` HTTP would send.
 *
 * @example
 * ```ts
 * const post = await call(byId, { id: '1' }, { ctx: { user }, layer: PostRepo.Live });
 * ```
 * @since 0.1.0
 * @stability stable
 */
export async function call<P extends AnyProcedure>(
  procedure: P,
  input: ProcedureDefOf<P>['input'],
  ...[opts]: {} extends CallOptions<ProcedureDefOf<P>>
    ? [opts?: CallOptions<ProcedureDefOf<P>>]
    : [opts: CallOptions<ProcedureDefOf<P>>]
): Promise<CallOutput<ProcedureDefOf<P>['output']>> {
  const o = (opts ?? {}) as {
    ctx?: object;
    signal?: AbortSignal;
    path?: string;
    layer?: Layer.Layer<never, any, never>;
    runtime?: Runtime<never>;
  };
  const response = createResponseHandle();
  const run = (signal: AbortSignal) =>
    Effect.flatMap(
      callProcedure({
        procedure,
        path: o.path ?? '',
        ctx: o.ctx ?? {},
        input,
        signal,
        response,
        allowResponse: true,
      }),
      (value) => inProcessOutput(value, response),
    );
  const effect = o.signal
    ? run(o.signal)
    : Effect.flatMap(interruptSignal(), (interrupt) =>
        interrupt.abortOnInterrupt(run(interrupt.signal)),
      );
  const provided = o.runtime
    ? Effect.flatMap(runtimeServices(o.runtime), (services) =>
        Effect.provideContext(effect, services),
      )
    : o.layer
      ? Effect.provide(effect, o.layer)
      : effect;
  const exit = await Effect.runPromiseExit(
    provided as Effect.Effect<
      CallOutput<ProcedureDefOf<P>['output']>,
      never,
      never
    >,
    { signal: o.signal },
  );
  if (Exit.isSuccess(exit)) return exit.value;
  const error = Cause.hasInterruptsOnly(exit.cause)
    ? abortedError(o.signal?.reason)
    : normalizeCause(exit.cause);
  throw frameworkError(error) ?? error;
}
