/**
 * The API `.agent-docs/open/handler-on-error-effect.md` proposes, as types:
 * B lets a handler's `onError` return an Effect, run in the request's
 * fiber, whose services join what the `layer` or `runtime` must provide.
 * A and C keep `onError` a synchronous callback.
 */
import type {
  AnyRouter,
  BaseHandlerOptions,
  ContextOption,
  FetchHandler,
  LayerOption,
  OnErrorOpts,
  RuntimeOption,
  TransformerOption,
  inferRouterContext,
  inferRouterServices,
} from '@trpc12/trpc/server';
import type { Effect } from 'effect';

/** B: the fetch handler's options, `onError` returning nothing or an Effect. */
export type FetchHandlerOptionsB<
  TRouter extends AnyRouter,
  TPlatform,
  R,
> = Omit<BaseHandlerOptions<TRouter>, 'onError'> & {
  onError?: (opts: OnErrorOpts) => void | Effect.Effect<void, never, R>;
} & ContextOption<inferRouterContext<TRouter>, TPlatform> &
  TransformerOption &
  (
    | LayerOption<inferRouterServices<TRouter> | NoInfer<R>>
    | RuntimeOption<inferRouterServices<TRouter> | NoInfer<R>>
  );

export declare function createFetchHandlerB<
  TRouter extends AnyRouter,
  TPlatform = undefined,
  R = never,
>(opts: FetchHandlerOptionsB<TRouter, TPlatform, R>): FetchHandler<TPlatform>;
