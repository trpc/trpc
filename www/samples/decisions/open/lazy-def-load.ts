/**
 * The API `.agent-docs/open/lazy-def-load.md` proposes, as types: B drops
 * `load()` from a lazy subtree's `~lazy`. A is `lazy` as it is.
 */
import type { AnyLazyRouter, AnyRouter } from '@trpc12/trpc/server';

/** B: a lazy subtree whose `~lazy` has `loadEffect`, `meta` and `loaded`, and no `load()`. */
export interface LazyRouterB<TRouter> {
  readonly '~lazy': Omit<AnyLazyRouter['~lazy'], 'load'>;
  readonly '~types'?: TRouter;
}

export declare function lazyB<TRouter extends AnyRouter>(
  load: () => Promise<TRouter | { default: TRouter }>,
): LazyRouterB<TRouter>;

/** B: `loadRouter`, accepting B's lazy subtrees. */
export declare function loadRouterB<TRouter extends object>(
  router: TRouter,
): Promise<TRouter>;
