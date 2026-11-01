/**
 * The API `.agent-docs/open/effect-lifecycle-callbacks.md` proposes, as
 * types: B lets a lifecycle helper's callback return an Effect, whose
 * services join the procedure's. A is `onError` as it is.
 */
import type { AnyTrpcError } from '@trpc12/trpc/client';
import type { EffectMiddleware, MiddlewareOpts } from '@trpc12/trpc/server';
import type { Effect } from 'effect';

/** B: `onError` takes a callback returning nothing, a promise or an Effect. */
export declare function onErrorB<
  TCtx = unknown,
  TInput = unknown,
  TMeta = unknown,
  R = never,
>(
  fn: (
    error: AnyTrpcError,
    opts: MiddlewareOpts<TCtx, TInput, TMeta>,
  ) => void | Promise<void> | Effect.Effect<void, never, R>,
): EffectMiddleware<TCtx, TInput, TMeta, {}, never, R, never>;
