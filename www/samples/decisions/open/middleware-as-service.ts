/**
 * The API `.agent-docs/open/middleware-as-service.md` proposes, as types:
 * B declares a middleware as a service key whose shape is
 * `experimental_MiddlewareImpl`, implemented by a layer, and adds a
 * `.use(Key)` overload. A is Effect middleware as it is.
 */
import type { AnyTrpcError } from '@trpc12/trpc/client';
import type { BuilderDef, CurrentCtx, With } from '@trpc12/trpc/internal';
import type {
  AnyProcedureBuilder,
  NextError,
  ProcedureBuilder,
} from '@trpc12/trpc/server';
import type { Context, Effect } from 'effect';

/** B: the rest of the chain, opaque to a middleware's implementation. */
export interface MiddlewareNextB {
  readonly '~middlewareNext': true;
}

/**
 * B: a middleware's implementation, the shape of its key: it runs `next`
 * with the services it provides, or fails with `E`.
 */
export type experimental_MiddlewareImplB<
  Provides,
  E extends AnyTrpcError,
  Ctx,
> = (
  next: Effect.Effect<MiddlewareNextB, NextError, Provides>,
  opts: { readonly ctx: Ctx },
) => Effect.Effect<MiddlewareNextB, E | NextError>;

/** B: a procedure builder with the `.use(Key)` overload. */
export type ProcedureBuilderB<D extends BuilderDef> = ProcedureBuilder<D> & {
  /**
   * Adds the middleware a key declares: it provides `Provides`, requires the
   * key itself from the handler's layer, and adds `E` to the errors. The
   * procedure's ctx must have what the key reads.
   */
  use<Self, Provides, E extends AnyTrpcError, Ctx>(
    key: Context.Key<Self, experimental_MiddlewareImplB<Provides, E, Ctx>> &
      (CurrentCtx<D> extends Ctx
        ? unknown
        : {
            '~error': 'the procedure has no ctx the middleware reads';
            ctx: Ctx;
          }),
  ): ProcedureBuilder<
    With<
      D,
      {
        errors: D['errors'] | E;
        provided: D['provided'] | Provides;
        requires: D['requires'] | Exclude<Self, D['provided']>;
      }
    >
  >;
};

/** B: a `t` whose `procedure` has the `.use(Key)` overload. */
export type WithUseKeyB<T extends { procedure: AnyProcedureBuilder }> = T & {
  procedure: ProcedureBuilderB<NonNullable<T['procedure']['~trpc']['~types']>>;
};
