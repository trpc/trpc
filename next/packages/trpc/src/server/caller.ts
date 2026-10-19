import { Effect, Exit, type Layer } from 'effect';
import { createTrpcClient } from '../client/client.ts';
import { localLink } from '../client/links/index.ts';
import { routerType, type TrpcClient } from '../client/types.ts';
import { frameworkError } from '../internal/error.ts';
import type { DansonForm, MaybePromise } from '../internal/types.ts';
import { callProcedure, normalizeCause } from './execution/index.ts';
import type {
  Procedure,
  ProcedureDef,
  AnyRouter,
  inferRouterContext,
  inferRouterServices,
} from './procedures/index.ts';

type CtxOption<TCtx> = {} extends TCtx
  ? { ctx?: TCtx | (() => MaybePromise<TCtx>) }
  : { ctx: TCtx | (() => MaybePromise<TCtx>) };

type ServicesOption<TServices> = [TServices] extends [never]
  ? { layer?: Layer.Layer<never, any, never> }
  : { layer: Layer.Layer<TServices, any, never> };

/**
 * Options for {@link createRouterClient}.
 * @since 0.1.0
 * @stability stable
 */
export type RouterClientOptions<TRouter extends AnyRouter> = CtxOption<
  inferRouterContext<TRouter>
> &
  ServicesOption<inferRouterServices<TRouter>>;

/**
 * Calls a router in-process with the same shape as the HTTP client (15
 * SC-A). Values are passed by reference, not serialized.
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
): TrpcClient<TRouter, {}, DansonForm, { builtinErrors: never }> {
  const o = (opts ?? {}) as {
    ctx?: object | (() => MaybePromise<object>);
    layer?: Layer.Layer<never, any, never>;
  };
  const ctx = o.ctx;
  return createTrpcClient({
    router: routerType<TRouter>(),
    links: [
      localLink({
        router,
        layer: o.layer,
        serializer: false,
        createContext: (typeof ctx === 'function'
          ? ctx
          : () => ctx ?? {}) as () => never,
      }),
    ],
  }) as TrpcClient<TRouter, {}, DansonForm, { builtinErrors: never }>;
}

/**
 * The options of {@link call}. `ctx` is required when the procedure needs
 * any, and `layer` when it needs Effect services; otherwise the options can
 * be left out.
 * @since 0.1.0
 * @stability stable
 */
export type CallOptions<TDef extends ProcedureDef> = ({} extends TDef['ctx']
  ? { ctx?: TDef['ctx'] }
  : { ctx: TDef['ctx'] }) & {
  signal?: AbortSignal;
  /** Passed to middleware and the resolver. @default '' */
  path?: string;
} & ServicesOption<TDef['services']>;

/**
 * Calls one procedure directly. Throws the procedure's `TrpcError`s. The
 * `layer` is built for the call and released after it.
 *
 * @example
 * ```ts
 * const post = await call(byId, { id: '1' }, { ctx: { user }, layer: PostRepo.Live });
 * ```
 * @since 0.1.0
 * @stability stable
 */
export async function call<TDef extends ProcedureDef>(
  procedure: Procedure<TDef>,
  input: TDef['input'],
  ...[opts]: {} extends CallOptions<TDef>
    ? [opts?: CallOptions<TDef>]
    : [opts: CallOptions<TDef>]
): Promise<TDef['output']> {
  const o = (opts ?? {}) as {
    ctx?: object;
    signal?: AbortSignal;
    path?: string;
    layer?: Layer.Layer<never, any, never>;
  };
  const effect = callProcedure({
    procedure,
    path: o.path ?? '',
    ctx: o.ctx ?? {},
    input,
    signal: o.signal ?? new AbortController().signal,
  });
  const layer = o.layer;
  const exit = await Effect.runPromiseExit(
    (layer ? Effect.provide(effect, layer) : effect) as Effect.Effect<
      TDef['output'],
      never,
      never
    >,
    { signal: o.signal },
  );
  if (Exit.isSuccess(exit)) return exit.value;
  const error = normalizeCause(exit.cause);
  throw frameworkError(error) ?? error;
}
