/**
 * Prototype of middleware as an Effect service (proposal 27 P2), the shape of
 * `effect/rpc`'s `RpcMiddleware` and `effect/http-api`'s `HttpApiMiddleware`:
 * the procedure names a key that declares what it provides and how it fails,
 * and a `Layer` implements it once, with its own dependencies. The key is
 * then a service the router requires, so the handler's `layer` must provide
 * the implementation.
 *
 * ```ts
 * class Auth extends Context.Service<Auth, MiddlewareImpl<CurrentUser, Unauthorized>>()('Auth') {}
 * const AuthLive = Layer.effect(Auth, Effect.gen(function* () {
 *   const sessions = yield* Sessions; // built once, with the handler
 *   return (next, { ctx }) => …next.pipe(Effect.provideService(CurrentUser, user))…;
 * }));
 * const authed = useService(t.procedure, Auth); // provides CurrentUser, may fail Unauthorized, requires Auth
 * ```
 */
import { Effect, type Context } from 'effect';
import type { BuilderDef, CurrentCtx, With } from '@trpc12/trpc/internal';
import {
  middleware,
  type AnyTrpcError,
  type ProcedureBuilder,
  type ProcedureType,
  type TypeError,
} from '@trpc12/trpc/server';

/** What the wrapped call succeeds with: opaque, as `RpcMiddleware.SuccessValue` is. */
export interface Next {
  readonly _: unique symbol;
}

/** The implementation a middleware's `Layer` provides. */
export interface MiddlewareImpl<
  Provides,
  E extends AnyTrpcError = never,
  Ctx = unknown,
> {
  (
    next: Effect.Effect<Next, never, Provides>,
    opts: {
      readonly ctx: Ctx;
      readonly meta: unknown;
      readonly path: string;
      readonly type: ProcedureType;
      readonly signal: AbortSignal;
    },
  ): Effect.Effect<Next, E>;
}

type CtxCheck<TDef extends BuilderDef, Ctx> =
  CurrentCtx<TDef> extends Ctx
    ? unknown
    : TypeError<
        'useService: the middleware needs ctx this procedure lacks',
        Ctx
      >;

export function useService<
  TDef extends BuilderDef,
  Id,
  Provides,
  E extends AnyTrpcError,
  Ctx,
>(
  builder: ProcedureBuilder<TDef> & CtxCheck<TDef, Ctx>,
  key: Context.Key<Id, MiddlewareImpl<Provides, E, Ctx>>,
): ProcedureBuilder<
  With<
    TDef,
    {
      provided: TDef['provided'] | Provides;
      requires: TDef['requires'] | Exclude<Id, TDef['provided']>;
      errors: TDef['errors'] | E;
    }
  >
> {
  const mw = middleware.effect<{ provides: never }>()(((opts: any) =>
    Effect.flatMap(key, (impl) => impl(opts.next(), opts))) as never);
  return (builder as ProcedureBuilder<any>).use(mw as never) as never;
}
