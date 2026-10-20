/**
 * The APIs `.agent-docs/open/effect-catch-tag-built-in-errors.md` proposes,
 * as types: B adds `catchDefined`, which catches a code only when the
 * procedure declared it; C tags built-in errors `TrpcError`, so
 * `catchTag(code)` catches declared ones only. A is `Effect.catchTag` on
 * the Effect client as it is.
 */
import type {
  AtLeastOneLink,
  LinksContext,
  LinksTypes,
  RouterOf,
  TypedClientOptions,
} from '@trpc12/trpc/client';
import type { EffectClient } from '@trpc12/trpc/effect';
import type { Effect, Stream } from 'effect';

type DefinedCodes<E> = E extends {
  readonly defined: true;
  readonly code: infer C;
}
  ? C
  : never;

/** B: catches `code` when the error is the procedure's own (`defined: true`). */
export declare const catchDefinedB: <
  const K extends DefinedCodes<E>,
  E,
  A1,
  E1,
  R1,
>(
  code: K,
  f: (
    err: NoInfer<Extract<E, { readonly code: K; readonly defined: true }>>,
  ) => Effect.Effect<A1, E1, R1>,
) => <A, R>(
  self: Effect.Effect<A, E, R>,
) => Effect.Effect<
  A | A1,
  Exclude<E, { readonly code: K; readonly defined: true }> | E1,
  R | R1
>;

/** C: a built-in error's `_tag` is `TrpcError`; a declared one's stays its code. */
export type RetagC<E> = E extends { readonly defined: false }
  ? Omit<E, '_tag'> & { readonly _tag: 'TrpcError' }
  : E;

/** C: an Effect client whose calls fail with {@link RetagC} errors. */
export type EffectClientC<T> = {
  [K in keyof T]: T[K] extends (
    ...args: infer Args
  ) => Effect.Effect<infer A, infer E, infer R>
    ? (...args: Args) => Effect.Effect<A, RetagC<E>, R>
    : T[K] extends (
          ...args: infer Args
        ) => Stream.Stream<infer A, infer E, infer R>
      ? (...args: Args) => Stream.Stream<A, RetagC<E>, R>
      : EffectClientC<T[K]>;
};

export declare function createEffectClientC<
  TSource,
  const TLinks extends AtLeastOneLink<RouterOf<TSource>>,
>(
  opts: TypedClientOptions<TSource, TLinks>,
): EffectClientC<
  EffectClient<RouterOf<TSource>, LinksContext<TLinks>, LinksTypes<TLinks>>
>;
