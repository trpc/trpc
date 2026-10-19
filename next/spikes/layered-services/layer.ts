/**
 * Prototype of `.provide(layer)` (proposal 27 P1) on the shipped builder, as
 * a function: `provideLayer(t.procedure, PostRepo.layer)`. A method would
 * have the same types and run the same step.
 *
 * - `'handler'` (the default) builds the layer once per handler, in the
 *   handler runtime's `MemoMap`: memoised by the layer's reference, so every
 *   procedure that provides `PostRepo.layer` shares one instance, and so does
 *   the handler's own `layer` if it has it too. A layer that fails to build is
 *   a defect, as the handler's `layer` is.
 * - `'call'` builds it per call, in a `MemoMap` forked from the handler's:
 *   what the handler already built is reused, the rest is built for the call
 *   and released when the call ends. Its failures must be `TrpcError`s and join
 *   the procedure's errors (Q2.3).
 *
 * Spike limits: the handler-lifetime build uses a scope per `MemoMap` that
 * `dispose()` doesn't close (the core would pass `ManagedRuntime.scope`), and
 * `'call'` scopes end when the resolver's Effect does, before a streamed
 * output is read.
 */
import { Context, Effect, Layer, Scope } from 'effect';
import type { BuilderDef, With } from '@trpc12/trpc/internal';
import {
  middleware,
  type AnyTrpcError,
  type ProcedureBuilder,
} from '@trpc12/trpc/server';

/** The builder after providing a layer's services. */
export type ProvidedDef<
  TDef extends BuilderDef,
  ROut,
  E extends AnyTrpcError,
  RIn,
> = With<
  TDef,
  {
    provided: TDef['provided'] | ROut;
    requires: TDef['requires'] | Exclude<RIn, TDef['provided']>;
    errors: TDef['errors'] | E;
  }
>;

/** Builds per handler when no handler runtime is there (`call()`, a bare router client). */
const fallback = Layer.makeMemoMapUnsafe();
const scopes = new WeakMap<Layer.MemoMap, Scope.Closeable>();
const scopeFor = (memoMap: Layer.MemoMap) => {
  let scope = scopes.get(memoMap);
  if (!scope) {
    scope = Scope.makeUnsafe();
    scopes.set(memoMap, scope);
  }
  return scope;
};

const handlerLifetime = (layer: Layer.Layer<any, any, any>) =>
  Effect.gen(function* () {
    const memoMap = Context.getOrUndefined(
      yield* Effect.context<never>(),
      Layer.CurrentMemoMap,
    );
    const map = memoMap ?? fallback;
    return yield* Effect.orDie(
      Layer.buildWithMemoMap(layer, map, scopeFor(map)),
    );
  });

export function provideLayer<
  TDef extends BuilderDef,
  ROut,
  RIn,
  E extends AnyTrpcError = never,
>(
  builder: ProcedureBuilder<TDef>,
  layer: Layer.Layer<ROut, E, RIn>,
  options: { lifetime: 'call' },
): ProcedureBuilder<ProvidedDef<TDef, ROut, E, RIn>>;
export function provideLayer<TDef extends BuilderDef, ROut, RIn>(
  builder: ProcedureBuilder<TDef>,
  layer: Layer.Layer<ROut, unknown, RIn>,
  options?: { lifetime?: 'handler' },
): ProcedureBuilder<ProvidedDef<TDef, ROut, never, RIn>>;
export function provideLayer(
  builder: ProcedureBuilder<any>,
  layer: Layer.Layer<any, any, any>,
  options?: { lifetime?: 'handler' | 'call' },
): ProcedureBuilder<any> {
  const mw = middleware.effect<{ provides: never }>()(({ next }) =>
    options?.lifetime === 'call'
      ? (Effect.provide(next(), layer) as never)
      : Effect.flatMap(handlerLifetime(layer), (built) =>
          Effect.updateContext(next(), (context: Context.Context<never>) =>
            Context.merge(context, built),
          ),
        ),
  );
  return builder.use(mw as never) as never;
}
