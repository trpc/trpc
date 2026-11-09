import { dual } from "../Function.ts"
import type { Kind, TypeLambda } from "../HKT.ts"
import type { NoInfer } from "../Types.ts"

interface Map<F extends TypeLambda> {
  <A, B>(
    f: (a: A) => B
  ): <R, O, E>(self: Kind<F, R, O, E, A>) => Kind<F, R, O, E, B>
  <R, O, E, A, B>(
    self: Kind<F, R, O, E, A>,
    f: (a: A) => B
  ): Kind<F, R, O, E, B>
}

interface FlatMap<F extends TypeLambda> {
  <A, R2, O2, E2, B>(
    f: (a: A) => Kind<F, R2, O2, E2, B>
  ): <R1, O1, E1>(
    self: Kind<F, R1, O1, E1, A>
  ) => Kind<F, R1 & R2, O1 | O2, E1 | E2, B>
  <R1, O1, E1, A, R2, O2, E2, B>(
    self: Kind<F, R1, O1, E1, A>,
    f: (a: A) => Kind<F, R2, O2, E2, B>
  ): Kind<F, R1 & R2, O1 | O2, E1 | E2, B>
}

/** @internal */
export const let_ = <F extends TypeLambda>(
  map: Map<F>
): {
  <N extends string, A extends object, B>(
    name: Exclude<N, keyof A>,
    f: (a: NoInfer<A>) => B
  ): <R, O, E>(
    self: Kind<F, R, O, E, A>
  ) => Kind<F, R, O, E, { [K in keyof A | N]: K extends keyof A ? A[K] : B }>
  <R, O, E, A extends object, N extends string, B>(
    self: Kind<F, R, O, E, A>,
    name: Exclude<N, keyof A>,
    f: (a: NoInfer<A>) => B
  ): Kind<F, R, O, E, { [K in keyof A | N]: K extends keyof A ? A[K] : B }>
} =>
  dual(
    3,
    <R, O, E, A extends object, N extends string, B>(
      self: Kind<F, R, O, E, A>,
      name: Exclude<N, keyof A>,
      f: (a: NoInfer<A>) => B
    ): Kind<F, R, O, E, { [K in keyof A | N]: K extends keyof A ? A[K] : B }> =>
      map(self, (a) => ({ ...a, [name]: f(a) }) as any)
  )

/** @internal */
export const bindTo = <F extends TypeLambda>(
  map: Map<F>
): {
  <N extends string>(
    name: N
  ): <R, O, E, A>(
    self: Kind<F, R, O, E, A>
  ) => Kind<F, R, O, E, Record<N, A>>
  <R, O, E, A, N extends string>(
    self: Kind<F, R, O, E, A>,
    name: N
  ): Kind<F, R, O, E, Record<N, A>>
} =>
  dual(
    2,
    <R, O, E, A, N extends string>(
      self: Kind<F, R, O, E, A>,
      name: N
    ): Kind<F, R, O, E, Record<N, A>> => map(self, (a) => ({ [name]: a }) as Record<N, A>)
  )

/** @internal */
export const bind = <F extends TypeLambda>(
  map: Map<F>,
  flatMap: FlatMap<F>
): {
  <N extends string, A extends object, R2, O2, E2, B>(
    name: Exclude<N, keyof A>,
    f: (a: NoInfer<A>) => Kind<F, R2, O2, E2, B>
  ): <R1, O1, E1>(
    self: Kind<F, R1, O1, E1, A>
  ) => Kind<
    F,
    R1 & R2,
    O1 | O2,
    E1 | E2,
    { [K in keyof A | N]: K extends keyof A ? A[K] : B }
  >
  <R1, O1, E1, A extends object, N extends string, R2, O2, E2, B>(
    self: Kind<F, R1, O1, E1, A>,
    name: Exclude<N, keyof A>,
    f: (a: NoInfer<A>) => Kind<F, R2, O2, E2, B>
  ): Kind<
    F,
    R1 & R2,
    O1 | O2,
    E1 | E2,
    { [K in keyof A | N]: K extends keyof A ? A[K] : B }
  >
} =>
  dual(
    3,
    <R1, O1, E1, A, N extends string, R2, O2, E2, B>(
      self: Kind<F, R1, O1, E1, A>,
      name: Exclude<N, keyof A>,
      f: (a: NoInfer<A>) => Kind<F, R2, O2, E2, B>
    ): Kind<
      F,
      R1 & R2,
      O1 | O2,
      E1 | E2,
      { [K in keyof A | N]: K extends keyof A ? A[K] : B }
    > => flatMap(self, (a) => map(f(a), (b) => ({ ...a, [name]: b }) as any))
  )
