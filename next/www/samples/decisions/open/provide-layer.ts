/**
 * The API `.agent-docs/open/provide-layer.md` proposes, as types: B adds a
 * `.provide(layer)` overload, built once per runtime, whose services drop
 * out of the router's and whose requirements join them. A is `.provide()`
 * as it is.
 */
import type { BuilderDef, With } from '@trpc12/trpc/internal';
import type {
  AnyProcedureBuilder,
  ProcedureBuilder,
  RootConfig,
  initTrpc,
} from '@trpc12/trpc/server';
import type { Layer } from 'effect';

/** B: a procedure builder with the `.provide(layer)` overload. */
export type ProcedureBuilderB<D extends BuilderDef> = ProcedureBuilder<D> & {
  /**
   * Provides a layer's services to everything after it, built once in the
   * runtime the call runs in. A layer that fails to build fails the call
   * with a masked `INTERNAL_SERVER_ERROR`, so its error isn't declared.
   */
  provide<ROut, E, RIn>(
    layer: Layer.Layer<ROut, E, RIn>,
  ): ProcedureBuilderB<
    With<
      D,
      {
        provided: D['provided'] | ROut;
        requires: D['requires'] | Exclude<RIn, D['provided']>;
      }
    >
  >;
};

/** B: a `t` whose `procedure` has the `.provide(layer)` overload. */
export type WithProvideLayerB<T extends { procedure: AnyProcedureBuilder }> =
  T & {
    procedure: ProcedureBuilderB<
      NonNullable<T['procedure']['~trpc']['~types']>
    >;
  };

/** B: `initTrpc()`, its `procedure` with the `.provide(layer)` overload. */
export declare function initTrpcB<TConfig extends RootConfig = {}>(
  ...args: Parameters<typeof initTrpc<TConfig>>
): WithProvideLayerB<ReturnType<typeof initTrpc<TConfig>>>;
