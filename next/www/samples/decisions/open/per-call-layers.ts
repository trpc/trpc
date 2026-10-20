/**
 * The API `.agent-docs/open/per-call-layers.md` proposes, as types: B adds
 * a `.provide(layer, { lifetime: 'call' })` overload that builds the layer
 * for each call. A is `.provide(Key, make)` and Effect middleware as they
 * are.
 */
import type { BuilderDef, With } from '@trpc12/trpc/internal';
import type {
  AnyProcedureBuilder,
  AnyTrpcError,
  ProcedureBuilder,
} from '@trpc12/trpc/server';
import type { Layer } from 'effect';

/** B: a procedure builder with the per-call `.provide(layer)` overload. */
export type ProcedureBuilderB<D extends BuilderDef> = ProcedureBuilder<D> & {
  /**
   * Builds `layer` for each call and provides its services to everything
   * after it. It may only fail with a `TrpcError`, which joins the
   * procedure's errors.
   */
  provide<ROut, E extends AnyTrpcError, RIn>(
    layer: Layer.Layer<ROut, E, RIn>,
    opts: { lifetime: 'call' },
  ): ProcedureBuilder<
    With<
      D,
      {
        errors: D['errors'] | E;
        provided: D['provided'] | ROut;
        requires: D['requires'] | Exclude<RIn, D['provided']>;
      }
    >
  >;
};

/** B: a `t` whose `procedure` has the per-call `.provide(layer)` overload. */
export type WithCallLayerB<T extends { procedure: AnyProcedureBuilder }> = T & {
  procedure: ProcedureBuilderB<NonNullable<T['procedure']['~trpc']['~types']>>;
};
