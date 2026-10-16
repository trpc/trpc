/**
 * The `Pipeable` module defines the shared interface and implementation helpers
 * for values that support Effect-style method chaining with `.pipe(...)`.
 *
 * A `Pipeable` value can pass itself through a sequence of unary functions from
 * left to right, so code can be written as `value.pipe(f, g, h)` instead of
 * deeply nesting calls. This is the method form used by many Effect data types
 * to compose transformations, validations, and effectful operations while
 * keeping the original value as the starting point of the pipeline.
 *
 * @since 2.0.0
 */

/**
 * Interface for values that support method-style `pipe` composition.
 *
 * **When to use**
 *
 * Use to type values that expose an Effect-style `.pipe(...)` method.
 *
 * **Details**
 *
 * Calling `value.pipe(f, g, h)` passes the value through each function from
 * left to right, returning the final result. Many Effect data types implement
 * this so operations can be chained without nesting function calls.
 *
 * **Example** (Chaining operations with pipe)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * // The Pipeable interface allows Effect values to be chained using the pipe method
 * const program = Effect.succeed(1).pipe(
 *   Effect.map((x) => x + 1),
 *   Effect.flatMap((x) => Effect.succeed(x * 2))
 * )
 *
 * Effect.runSync(program) // => 4
 * ```
 *
 * @category models
 * @since 2.0.0
 */
export interface Pipeable {
  pipe<A>(this: A): A
  pipe<A, B = never>(this: A, ab: (_: A) => B): B
  pipe<A, B = never, C = never>(this: A, ab: (_: A) => B, bc: (_: B) => C): C
  pipe<A, B = never, C = never, D = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D): D
  pipe<A, B = never, C = never, D = never, E = never>(
    this: A,
    ab: (_: A) => B,
    bc: (_: B) => C,
    cd: (_: C) => D,
    de: (_: D) => E
  ): E
  pipe<A, B = never, C = never, D = never, E = never, F = never>(
    this: A,
    ab: (_: A) => B,
    bc: (_: B) => C,
    cd: (_: C) => D,
    de: (_: D) => E,
    ef: (_: E) => F
  ): F
  pipe<A, B = never, C = never, D = never, E = never, F = never, G = never>(
    this: A,
    ab: (_: A) => B,
    bc: (_: B) => C,
    cd: (_: C) => D,
    de: (_: D) => E,
    ef: (_: E) => F,
    fg: (_: F) => G
  ): G
  pipe<A, B = never, C = never, D = never, E = never, F = never, G = never, H = never>(
    this: A,
    ab: (_: A) => B,
    bc: (_: B) => C,
    cd: (_: C) => D,
    de: (_: D) => E,
    ef: (_: E) => F,
    fg: (_: F) => G,
    gh: (_: G) => H
  ): H
  pipe<A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never>(
    this: A,
    ab: (_: A) => B,
    bc: (_: B) => C,
    cd: (_: C) => D,
    de: (_: D) => E,
    ef: (_: E) => F,
    fg: (_: F) => G,
    gh: (_: G) => H,
    hi: (_: H) => I
  ): I
  pipe<A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never, J = never>(
    this: A,
    ab: (_: A) => B,
    bc: (_: B) => C,
    cd: (_: C) => D,
    de: (_: D) => E,
    ef: (_: E) => F,
    fg: (_: F) => G,
    gh: (_: G) => H,
    hi: (_: H) => I,
    ij: (_: I) => J
  ): J
  pipe<A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never, J = never, K = never>(
    this: A,
    ab: (_: A) => B,
    bc: (_: B) => C,
    cd: (_: C) => D,
    de: (_: D) => E,
    ef: (_: E) => F,
    fg: (_: F) => G,
    gh: (_: G) => H,
    hi: (_: H) => I,
    ij: (_: I) => J,
    jk: (_: J) => K
  ): K
  pipe<
    A,
    B = never,
    C = never,
    D = never,
    E = never,
    F = never,
    G = never,
    H = never,
    I = never,
    J = never,
    K = never,
    L = never
  >(
    this: A,
    ab: (_: A) => B,
    bc: (_: B) => C,
    cd: (_: C) => D,
    de: (_: D) => E,
    ef: (_: E) => F,
    fg: (_: F) => G,
    gh: (_: G) => H,
    hi: (_: H) => I,
    ij: (_: I) => J,
    jk: (_: J) => K,
    kl: (_: K) => L
  ): L
  pipe<
    A,
    B = never,
    C = never,
    D = never,
    E = never,
    F = never,
    G = never,
    H = never,
    I = never,
    J = never,
    K = never,
    L = never,
    M = never
  >(
    this: A,
    ab: (_: A) => B,
    bc: (_: B) => C,
    cd: (_: C) => D,
    de: (_: D) => E,
    ef: (_: E) => F,
    fg: (_: F) => G,
    gh: (_: G) => H,
    hi: (_: H) => I,
    ij: (_: I) => J,
    jk: (_: J) => K,
    kl: (_: K) => L,
    lm: (_: L) => M
  ): M
  pipe<
    A,
    B = never,
    C = never,
    D = never,
    E = never,
    F = never,
    G = never,
    H = never,
    I = never,
    J = never,
    K = never,
    L = never,
    M = never,
    N = never
  >(
    this: A,
    ab: (_: A) => B,
    bc: (_: B) => C,
    cd: (_: C) => D,
    de: (_: D) => E,
    ef: (_: E) => F,
    fg: (_: F) => G,
    gh: (_: G) => H,
    hi: (_: H) => I,
    ij: (_: I) => J,
    jk: (_: J) => K,
    kl: (_: K) => L,
    lm: (_: L) => M,
    mn: (_: M) => N
  ): N
  pipe<
    A,
    B = never,
    C = never,
    D = never,
    E = never,
    F = never,
    G = never,
    H = never,
    I = never,
    J = never,
    K = never,
    L = never,
    M = never,
    N = never,
    O = never
  >(
    this: A,
    ab: (_: A) => B,
    bc: (_: B) => C,
    cd: (_: C) => D,
    de: (_: D) => E,
    ef: (_: E) => F,
    fg: (_: F) => G,
    gh: (_: G) => H,
    hi: (_: H) => I,
    ij: (_: I) => J,
    jk: (_: J) => K,
    kl: (_: K) => L,
    lm: (_: L) => M,
    mn: (_: M) => N,
    no: (_: N) => O
  ): O
  pipe<
    A,
    B = never,
    C = never,
    D = never,
    E = never,
    F = never,
    G = never,
    H = never,
    I = never,
    J = never,
    K = never,
    L = never,
    M = never,
    N = never,
    O = never,
    P = never
  >(
    this: A,
    ab: (_: A) => B,
    bc: (_: B) => C,
    cd: (_: C) => D,
    de: (_: D) => E,
    ef: (_: E) => F,
    fg: (_: F) => G,
    gh: (_: G) => H,
    hi: (_: H) => I,
    ij: (_: I) => J,
    jk: (_: J) => K,
    kl: (_: K) => L,
    lm: (_: L) => M,
    mn: (_: M) => N,
    no: (_: N) => O,
    op: (_: O) => P
  ): P
  pipe<
    A,
    B = never,
    C = never,
    D = never,
    E = never,
    F = never,
    G = never,
    H = never,
    I = never,
    J = never,
    K = never,
    L = never,
    M = never,
    N = never,
    O = never,
    P = never,
    Q = never
  >(
    this: A,
    ab: (_: A) => B,
    bc: (_: B) => C,
    cd: (_: C) => D,
    de: (_: D) => E,
    ef: (_: E) => F,
    fg: (_: F) => G,
    gh: (_: G) => H,
    hi: (_: H) => I,
    ij: (_: I) => J,
    jk: (_: J) => K,
    kl: (_: K) => L,
    lm: (_: L) => M,
    mn: (_: M) => N,
    no: (_: N) => O,
    op: (_: O) => P,
    pq: (_: P) => Q
  ): Q
  pipe<
    A,
    B = never,
    C = never,
    D = never,
    E = never,
    F = never,
    G = never,
    H = never,
    I = never,
    J = never,
    K = never,
    L = never,
    M = never,
    N = never,
    O = never,
    P = never,
    Q = never,
    R = never
  >(
    this: A,
    ab: (_: A) => B,
    bc: (_: B) => C,
    cd: (_: C) => D,
    de: (_: D) => E,
    ef: (_: E) => F,
    fg: (_: F) => G,
    gh: (_: G) => H,
    hi: (_: H) => I,
    ij: (_: I) => J,
    jk: (_: J) => K,
    kl: (_: K) => L,
    lm: (_: L) => M,
    mn: (_: M) => N,
    no: (_: N) => O,
    op: (_: O) => P,
    pq: (_: P) => Q,
    qr: (_: Q) => R
  ): R
  pipe<
    A,
    B = never,
    C = never,
    D = never,
    E = never,
    F = never,
    G = never,
    H = never,
    I = never,
    J = never,
    K = never,
    L = never,
    M = never,
    N = never,
    O = never,
    P = never,
    Q = never,
    R = never,
    S = never
  >(
    this: A,
    ab: (_: A) => B,
    bc: (_: B) => C,
    cd: (_: C) => D,
    de: (_: D) => E,
    ef: (_: E) => F,
    fg: (_: F) => G,
    gh: (_: G) => H,
    hi: (_: H) => I,
    ij: (_: I) => J,
    jk: (_: J) => K,
    kl: (_: K) => L,
    lm: (_: L) => M,
    mn: (_: M) => N,
    no: (_: N) => O,
    op: (_: O) => P,
    pq: (_: P) => Q,
    qr: (_: Q) => R,
    rs: (_: R) => S
  ): S
  pipe<
    A,
    B = never,
    C = never,
    D = never,
    E = never,
    F = never,
    G = never,
    H = never,
    I = never,
    J = never,
    K = never,
    L = never,
    M = never,
    N = never,
    O = never,
    P = never,
    Q = never,
    R = never,
    S = never,
    T = never
  >(
    this: A,
    ab: (_: A) => B,
    bc: (_: B) => C,
    cd: (_: C) => D,
    de: (_: D) => E,
    ef: (_: E) => F,
    fg: (_: F) => G,
    gh: (_: G) => H,
    hi: (_: H) => I,
    ij: (_: I) => J,
    jk: (_: J) => K,
    kl: (_: K) => L,
    lm: (_: L) => M,
    mn: (_: M) => N,
    no: (_: N) => O,
    op: (_: O) => P,
    pq: (_: P) => Q,
    qr: (_: Q) => R,
    rs: (_: R) => S,
    st: (_: S) => T
  ): T
  pipe<
    A,
    B = never,
    C = never,
    D = never,
    E = never,
    F = never,
    G = never,
    H = never,
    I = never,
    J = never,
    K = never,
    L = never,
    M = never,
    N = never,
    O = never,
    P = never,
    Q = never,
    R = never,
    S = never,
    T = never,
    U = never
  >(
    this: A,
    ab: (_: A) => B,
    bc: (_: B) => C,
    cd: (_: C) => D,
    de: (_: D) => E,
    ef: (_: E) => F,
    fg: (_: F) => G,
    gh: (_: G) => H,
    hi: (_: H) => I,
    ij: (_: I) => J,
    jk: (_: J) => K,
    kl: (_: K) => L,
    lm: (_: L) => M,
    mn: (_: M) => N,
    no: (_: N) => O,
    op: (_: O) => P,
    pq: (_: P) => Q,
    qr: (_: Q) => R,
    rs: (_: R) => S,
    st: (_: S) => T,
    tu: (_: T) => U
  ): U
  pipe<
    A,
    B = never,
    C = never,
    D = never,
    E = never,
    F = never,
    G = never,
    H = never,
    I = never,
    J = never,
    K = never,
    L = never,
    M = never,
    N = never,
    O = never,
    P = never,
    Q = never,
    R = never,
    S = never,
    T = never,
    U = never
  >(
    this: A,
    ab: (_: A) => B,
    bc: (_: B) => C,
    cd: (_: C) => D,
    de: (_: D) => E,
    ef: (_: E) => F,
    fg: (_: F) => G,
    gh: (_: G) => H,
    hi: (_: H) => I,
    ij: (_: I) => J,
    jk: (_: J) => K,
    kl: (_: K) => L,
    lm: (_: L) => M,
    mn: (_: M) => N,
    no: (_: N) => O,
    op: (_: O) => P,
    pq: (_: P) => Q,
    qr: (_: Q) => R,
    rs: (_: R) => S,
    st: (_: S) => T,
    tu: (_: T) => U
  ): U
}

/**
 * Applies a `pipe` method's variadic arguments to an initial value from left
 * to right.
 *
 * **When to use**
 *
 * Use to implement a custom `.pipe(...)` method from JavaScript's `arguments`
 * object.
 *
 * **Details**
 *
 * This helper is intended for implementing `Pipeable.pipe` methods that
 * receive JavaScript's `arguments` object. With no functions it returns the
 * original value; otherwise it feeds each result into the next function.
 *
 * **Example** (Implementing a pipe method)
 *
 * ```ts import.meta.vitest
 * import { Pipeable } from "effect"
 *
 * class NumberBox {
 *   constructor(readonly value: number) {}
 *
 *   pipe(..._fns: ReadonlyArray<(value: number) => number>): number {
 *     return Pipeable.pipeArguments(this.value, arguments) as number
 *   }
 * }
 *
 * const result = new NumberBox(5).pipe(
 *   (n) => n + 2,
 *   (n) => n * 3
 * )
 * result // => 21
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export const pipeArguments = <A>(self: A, args: IArguments): unknown => {
  switch (args.length) {
    case 0:
      return self
    case 1:
      return args[0](self)
    case 2:
      return args[1](args[0](self))
    case 3:
      return args[2](args[1](args[0](self)))
    case 4:
      return args[3](args[2](args[1](args[0](self))))
    case 5:
      return args[4](args[3](args[2](args[1](args[0](self)))))
    case 6:
      return args[5](args[4](args[3](args[2](args[1](args[0](self))))))
    case 7:
      return args[6](args[5](args[4](args[3](args[2](args[1](args[0](self)))))))
    case 8:
      return args[7](args[6](args[5](args[4](args[3](args[2](args[1](args[0](self))))))))
    case 9:
      return args[8](args[7](args[6](args[5](args[4](args[3](args[2](args[1](args[0](self)))))))))
    default: {
      let ret = self
      for (let i = 0, len = args.length; i < len; i++) {
        ret = args[i](ret)
      }
      return ret
    }
  }
}

/**
 * Reusable prototype that implements `Pipeable.pipe`.
 *
 * **When to use**
 *
 * Use when classes or object prototypes can reuse this value when they need the
 * standard pipe implementation backed by `pipeArguments`.
 *
 * @category prototypes
 * @since 3.15.0
 */
export const Prototype: Pipeable = {
  pipe() {
    return pipeArguments(this, arguments)
  }
}

/**
 * Provides a base constructor whose instances implement the standard `Pipeable.pipe`
 * method.
 *
 * **When to use**
 *
 * Use when you need to define a class that supports Effect-style method
 * chaining through `.pipe(...)`.
 *
 * @category constructors
 * @since 3.15.0
 */
export const Class: new() => Pipeable = (function() {
  function PipeableBase() {}
  PipeableBase.prototype = Prototype
  return PipeableBase as any
})()

/**
 * Constructor type for classes whose instances implement `Pipeable`.
 *
 * **When to use**
 *
 * Use as the constructor-side type when a class value should be known to create
 * instances that support Effect-style method chaining with `.pipe(...)`.
 *
 * @see {@link Pipeable} for the instance-side contract
 * @see {@link Class} for the base constructor
 * @see {@link Mixin} for wrapping an existing class constructor
 *
 * @category models
 * @since 3.15.0
 */
export interface PipeableConstructor {
  new(...args: ReadonlyArray<any>): Pipeable
}

/**
 * Returns a subclass of the provided class that adds the standard `pipe`
 * method.
 *
 * **When to use**
 *
 * Use to add pipe support to an existing class without extending a base class
 * or modifying its prototype.
 *
 * **Details**
 *
 * The original constructor and instance members are preserved, and the added
 * method delegates to `pipeArguments`.
 *
 * @see {@link Prototype} for a reusable prototype object
 * @see {@link Class} for a base constructor to extend
 * @category constructors
 * @since 4.0.0
 */
export const Mixin = <TBase extends new(...args: ReadonlyArray<any>) => any>(
  klass: TBase
): TBase & PipeableConstructor => (class extends klass {
  pipe() {
    return pipeArguments(this, arguments)
  }
})
