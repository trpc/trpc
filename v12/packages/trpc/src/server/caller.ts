import type { ManagedRuntime } from 'effect';
import { createTrpcClient } from '../client/client.ts';
import { localLink, type LocalLinkOptions } from '../client/links/index.ts';
import { routerType, type TrpcClient } from '../client/types.ts';
import type { ProgressiveJsonForm, MaybePromise } from '../internal/types.ts';
import type { RuntimeOption } from './handler/index.ts';
import {
  checkRouterKeys,
  type AnyRouter,
  type inferRouterContext,
  type inferRouterServices,
  type RootRouterCheck,
} from './procedures/index.ts';

type CtxOption<TCtx> = {} extends TCtx
  ? { ctx?: TCtx | (() => MaybePromise<TCtx>) }
  : { ctx: TCtx | (() => MaybePromise<TCtx>) };

type Runtime<TServices> = ManagedRuntime.ManagedRuntime<TServices, unknown>;

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
  router: TRouter & RootRouterCheck<TRouter>,
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
