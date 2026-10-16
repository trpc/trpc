/**
 * Provides pseudo-random generation through an Effect service.
 *
 * This module exposes effectful generators for booleans, doubles, safe
 * integers, bounded numbers, shuffling, and deterministic seeded runs. Because
 * random generation is a service, tests and applications can replace the
 * generator used by Effect programs.
 *
 * @since 4.0.0
 */
import type * as Arr from "./Array.ts"
import * as Cause from "./Cause.ts"
import type * as Context from "./Context.ts"
import * as Effect from "./Effect.ts"
import { dual } from "./Function.ts"
import * as random from "./internal/random.ts"
import type * as NonEmptyIterable from "./NonEmptyIterable.ts"
import * as Predicate from "./Predicate.ts"

/**
 * The service used to generate pseudo-random numbers.
 *
 * @category services
 * @since 4.0.0
 */
export interface Random {
  /**
   * Generates a random safe integer.
   */
  nextIntUnsafe(): number
  /**
   * Generates a random number between 0 (inclusive) and 1 (exclusive).
   */
  nextDoubleUnsafe(): number
}

/**
 * Represents a service for generating pseudo-random numbers.
 *
 * **When to use**
 *
 * Use to access or provide the random-number generator service used by Effect
 * programs.
 *
 * **Gotchas**
 *
 * The default implementation is based on `Math.random` and is not
 * cryptographically secure. Replace the service with a cryptographically secure
 * implementation before using these generators for security-sensitive values.
 *
 * **Example** (Accessing the random service)
 *
 * ```ts import.meta.vitest
 * import { Effect, Random } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const float = yield* Random.next
 *   const integer = yield* Random.nextInt
 *   const inRange = yield* Random.nextIntBetween(1, 100)
 *   return [float, integer, inRange] as const
 * })
 *
 * await Effect.runPromise(program.pipe(Random.withSeed("example"))) // => [0.1633802591287037, 3434461687501127, 1]
 * ```
 *
 * @category services
 * @since 2.0.0
 */
export const Random: Context.Reference<Random> = random.Random

const randomWith = <A>(f: (random: Random) => A): Effect.Effect<A> =>
  Effect.withFiber((fiber) => Effect.succeed(f(fiber.getRef(Random))))

/**
 * Generates a random number between 0 (inclusive) and 1 (exclusive).
 *
 * **When to use**
 *
 * Use to generate a pseudo-random floating-point number in the standard
 * `[0, 1)` range.
 *
 * **Example** (Generating a random number)
 *
 * ```ts import.meta.vitest
 * import { Effect, Random } from "effect"
 *
 * await Effect.runPromise(Random.next.pipe(Random.withSeed("example"))) // => 0.1633802591287037
 * ```
 *
 * @category generators
 * @since 2.0.0
 */
export const next: Effect.Effect<number> = randomWith((r) => r.nextDoubleUnsafe())

/**
 * Generates a random boolean value.
 *
 * **When to use**
 *
 * Use to make a pseudo-random true-or-false choice.
 *
 * **Example** (Generating a random boolean)
 *
 * ```ts import.meta.vitest
 * import { Effect, Random } from "effect"
 *
 * await Effect.runPromise(Random.nextBoolean.pipe(Random.withSeed("example"))) // => false
 * ```
 *
 * @category generators
 * @since 2.0.0
 */
export const nextBoolean: Effect.Effect<boolean> = randomWith((r) => r.nextDoubleUnsafe() > 0.5)

/**
 * Generates a random integer between `Number.MIN_SAFE_INTEGER` (inclusive)
 * and `Number.MAX_SAFE_INTEGER` (inclusive).
 *
 * **When to use**
 *
 * Use to generate a pseudo-random safe integer across the full safe-integer
 * range.
 *
 * **Example** (Generating a random integer)
 *
 * ```ts import.meta.vitest
 * import { Effect, Random } from "effect"
 *
 * await Effect.runPromise(Random.nextInt.pipe(Random.withSeed("example"))) // => -6064002158214091
 * ```
 *
 * @category generators
 * @since 2.0.0
 */
export const nextInt: Effect.Effect<number> = randomWith((r) => r.nextIntUnsafe())

/**
 * Generates a random number between `min` (inclusive) and `max` (exclusive).
 *
 * **When to use**
 *
 * Use to generate a pseudo-random floating-point number within a numeric range.
 *
 * **Example** (Generating a bounded random number)
 *
 * ```ts import.meta.vitest
 * import { Effect, Random } from "effect"
 *
 * await Effect.runPromise(Random.nextBetween(0, 1).pipe(Random.withSeed("example"))) // => 0.1633802591287037
 * ```
 *
 * @category generators
 * @since 4.0.0
 */
export const nextBetween = (min: number, max: number): Effect.Effect<number> =>
  randomWith((r) => random.nextBetween(min, max, r.nextDoubleUnsafe()))

/**
 * Generates a random integer between `min` and `max`.
 *
 * **When to use**
 *
 * Use to generate a pseudo-random integer within a rounded numeric range.
 *
 * **Details**
 *
 * The lower bound is rounded up with `Math.ceil` and the upper bound is
 * rounded down with `Math.floor`. By default the range is inclusive; set
 * `options.halfOpen: true` to exclude the upper bound.
 *
 * **Example** (Generating a bounded random integer)
 *
 * ```ts import.meta.vitest
 * import { Effect, Random } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const diceRoll1 = yield* Random.nextIntBetween(1, 6)
 *   const diceRoll2 = yield* Random.nextIntBetween(1, 6, {
 *     halfOpen: true
 *   })
 *   const diceRoll3 = yield* Random.nextIntBetween(0, 10)
 *   return [diceRoll1, diceRoll2, diceRoll3]
 * })
 *
 * await Effect.runPromise(program.pipe(Random.withSeed("example"))) // => [1, 4, 0]
 * ```
 *
 * @category generators
 * @since 2.0.0
 */
export const nextIntBetween = (min: number, max: number, options?: {
  readonly halfOpen?: boolean
}): Effect.Effect<number> => {
  const extra = options?.halfOpen === true ? 0 : 1
  return randomWith((r) => {
    const minInt = Math.ceil(min)
    const maxInt = Math.floor(max)
    return Math.floor(r.nextDoubleUnsafe() * (maxInt - minInt + extra)) + minInt
  })
}

/**
 * Uses the pseudo-random number generator to shuffle the specified iterable.
 *
 * **When to use**
 *
 * Use to randomly reorder an iterable using the active `Random` service.
 *
 * **Example** (Shuffling values)
 *
 * ```ts import.meta.vitest
 * import { Effect, Random } from "effect"
 *
 * await Effect.runPromise(Random.shuffle([1, 2, 3, 4, 5]).pipe(Random.withSeed("example"))) // => [4, 2, 5, 3, 1]
 * ```
 *
 * @category generators
 * @since 2.0.0
 */
export const shuffle = <A>(elements: Iterable<A>): Effect.Effect<Array<A>> =>
  randomWith((r) => {
    const buffer = Array.from(elements)
    for (let i = buffer.length - 1; i >= 1; i = i - 1) {
      const index = Math.min(i, Math.floor(r.nextDoubleUnsafe() * (i + 1)))
      const value = buffer[i]!
      buffer[i] = buffer[index]!
      buffer[index] = value
    }
    return buffer
  })

/**
 * Gets a random element from an iterable.
 *
 * **When to use**
 *
 * Use to select one value uniformly from a collection using the active `Random`
 * service.
 *
 * **Details**
 *
 * If the input type is known to be non-empty, the returned effect cannot fail.
 * Otherwise, empty iterables fail with `Cause.NoSuchElementError`.
 *
 * **Example** (Choosing a random value)
 *
 * ```ts import.meta.vitest
 * import { Effect, Random } from "effect"
 *
 * await Effect.runPromise(Random.choice(["red", "green", "blue"] as const).pipe(Random.withSeed("example"))) // => "red"
 * ```
 *
 * @category generators
 * @since 3.6.0
 */
export const choice: <Self extends Iterable<unknown>>(
  elements: Self
) => Self extends NonEmptyIterable.NonEmptyIterable<infer A> ? Effect.Effect<A>
  : Self extends Arr.NonEmptyReadonlyArray<infer A> ? Effect.Effect<A>
  : Self extends Iterable<infer A> ? Effect.Effect<A, Cause.NoSuchElementError>
  : never = ((elements: Iterable<unknown>) => {
    const buffer = Array.from(elements)
    return buffer.length === 0
      ? Effect.fail(new Cause.NoSuchElementError("Cannot select a random element from an empty array"))
      : randomWith((r) => buffer[Math.min(buffer.length - 1, Math.floor(r.nextDoubleUnsafe() * buffer.length))]!)
  }) as any

/**
 * Seeds the pseudo-random number generator with the specified value.
 *
 * **When to use**
 *
 * Use to run an effect with a deterministic pseudo-random sequence.
 *
 * **Details**
 *
 * Using the same seed produces the same random sequence, which is useful for
 * tests and reproducible simulations.
 *
 * **Gotchas**
 *
 * Use an unpredictable seed when uniqueness or unpredictability matters.
 *
 * **Example** (Seeding random generation)
 *
 * ```ts import.meta.vitest
 * import { Effect, Random } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const value1 = yield* Random.next
 *   const value2 = yield* Random.next
 *   return [value1, value2]
 * })
 *
 * await Effect.runPromise(Effect.all([
 *   program.pipe(Random.withSeed("my-seed")),
 *   program.pipe(Random.withSeed("my-seed"))
 * ])) // => [[0.018368576514773527, 0.4010840628128671], [0.018368576514773527, 0.4010840628128671]]
 * ```
 *
 * @category providing services
 * @since 4.0.0
 */
export const withSeed: {
  (seed: string | number): <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
  <A, E, R>(self: Effect.Effect<A, E, R>, seed: string | number): Effect.Effect<A, E, R>
} = dual(2, <A, E, R>(
  self: Effect.Effect<A, E, R>,
  seed: string | number
) => Effect.provideService(self, Random, ISAAC_CSPRNG(seed)))

/*///////////////////////////////////////////////////////////////////////////////////////////////////
This is a derivative work copyright (c) 2025 Effectful Technologies Inc, under MIT license.
This is a derivative work copyright (c) 2018, William P. "Mac" McMeans, under BSD license.
Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
3. Neither the name of isaacCSPRNG nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.
THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
Original work copyright (c) 2012 Yves-Marie K. Rinquin, under MIT license.
https://github.com/rubycon/isaac.js
///////////////////////////////////////////////////////////////////////////////////////////////////*/
function ISAAC_CSPRNG(userSeed?: string | number) {
  // Internal State
  const memory = new Array(256)
  const result = new Array(256)
  let accumulator = 0
  let lastResult = 0
  let generation = 0
  let counter = 0

  // Initial Seed
  const internalSeed = Predicate.isUndefined(userSeed) ? getInitialSeed() : userSeed
  seed(internalSeed)

  function getInitialSeed() {
    const uint32a = new Uint32Array(2)
    crypto.getRandomValues(uint32a)
    return uint32a[0] + uint32a[1]
  }

  function reset() {
    accumulator = 0
    lastResult = 0
    counter = 0
    for (let i = 0; i < 256; ++i) {
      memory[i] = 0
      result[i] = 0
    }
    generation = 0
  }

  function seed(userSeed: string | number): void {
    // The golden ratio ( 2654435769 )
    // See https://stackoverflow.com/questions/4948780/magic-number-in-boosthash-combine
    const magicNumber = 0x9e3779b9
    let a = magicNumber
    let b = magicNumber
    let c = magicNumber
    let d = magicNumber
    let e = magicNumber
    let f = magicNumber
    let g = magicNumber
    let h = magicNumber
    let i = 0

    let seed: Array<number>
    if (Predicate.isString(userSeed)) {
      seed = toIntArray(userSeed)
    } else {
      seed = [userSeed]
    }

    reset()

    for (i = 0; i < seed.length; i++) {
      result[i & 0xff] += seed[i]
    }

    function mix() {
      a ^= b << 11
      d = add32(d, a)
      b = add32(b, c)

      b ^= c >>> 2
      e = add32(e, b)
      c = add32(c, d)

      c ^= d << 8
      f = add32(f, c)
      d = add32(d, e)

      d ^= e >>> 16
      g = add32(g, d)
      e = add32(e, f)

      e ^= f << 10
      h = add32(h, e)
      f = add32(f, g)

      f ^= g >>> 4
      a = add32(a, f)
      g = add32(g, h)

      g ^= h << 8
      b = add32(b, g)
      h = add32(h, a)

      h ^= a >>> 9
      c = add32(c, h)
      a = add32(a, b)
    }

    // Scramble the seed
    for (i = 0; i < 4; i++) {
      mix()
    }

    for (i = 0; i < 256; i += 8) {
      // Use all the information in the seed
      a = add32(a, result[i])
      b = add32(b, result[i + 1])
      c = add32(c, result[i + 2])
      d = add32(d, result[i + 3])
      e = add32(e, result[i + 4])
      f = add32(f, result[i + 5])
      g = add32(g, result[i + 6])
      h = add32(h, result[i + 7])

      mix()

      // Fill in the memory with messy stuff
      memory[i] = a
      memory[i + 1] = b
      memory[i + 2] = c
      memory[i + 3] = d
      memory[i + 4] = e
      memory[i + 5] = f
      memory[i + 6] = g
      memory[i + 7] = h
    }

    // Second pass to make sure seed affects memory
    for (i = 0; i < 256; i += 8) {
      a = add32(a, memory[i])
      b = add32(b, memory[i + 1])
      c = add32(c, memory[i + 2])
      d = add32(d, memory[i + 3])
      e = add32(e, memory[i + 4])
      f = add32(f, memory[i + 5])
      g = add32(g, memory[i + 6])
      h = add32(h, memory[i + 7])

      mix()

      // Fill in the memory with messy stuff (again)
      memory[i] = a
      memory[i + 1] = b
      memory[i + 2] = c
      memory[i + 3] = d
      memory[i + 4] = e
      memory[i + 5] = f
      memory[i + 6] = g
      memory[i + 7] = h
    }

    pnrg()

    generation = 256
  }

  function pnrg(n?: number): void {
    let i = 0
    let x = 0
    let y = 0

    n = Predicate.isUndefined(n) ? 1 : Math.abs(Math.floor(n))

    while (n--) {
      counter = add32(counter, 1)
      lastResult = add32(lastResult, counter)

      for (i = 0; i < 256; i++) {
        switch (i & 3) {
          case 0: {
            accumulator ^= accumulator << 13
            break
          }
          case 1: {
            accumulator ^= accumulator >>> 6
            break
          }
          case 2: {
            accumulator ^= accumulator << 2
            break
          }
          case 3: {
            accumulator ^= accumulator >>> 16
            break
          }
        }

        accumulator = add32(memory[(i + 128) & 0xff], accumulator)
        x = memory[i]

        memory[i] = add32(memory[(x >>> 2) & 0xff], add32(accumulator, lastResult))
        y = memory[i]

        result[i] = add32(memory[(y >>> 10) & 0xff], x)
        lastResult = result[i]
      }
    }
  }

  /**
   * Returns a signed, random integer in the range [-2^31, 2^31).
   */
  function nextInt32(): number {
    if (!generation--) {
      pnrg()
      generation = 255
    }
    return result[generation]
  }

  function nextIntUnsafe(): number {
    return Math.floor(nextDoubleUnsafe() * (Number.MAX_SAFE_INTEGER - Number.MIN_SAFE_INTEGER + 1)) +
      Number.MIN_SAFE_INTEGER
  }

  /**
   * Returns a 53-bit fraction in the range [0, 1).
   */
  function nextDoubleUnsafe(): number {
    const hi = (nextInt32() >>> 0) & 0x1FFFFF // take top 21 bits
    const lo = nextInt32() >>> 0 // full 32 bits

    // 53-bit integer
    const combined = hi * 4294967296 + lo

    return combined / 0x20000000000000 // [0, 1)
  }

  return { nextIntUnsafe, nextDoubleUnsafe }
}

/**
 * 32-bit addition with overflow handling (JavaScript numbers are 53-bit).
 *
 * Example: add32(0xFFFFFFFF, 0x00000001) = 0x00000000 (wraps around)
 */
function add32(x: number, y: number): number {
  // Add lower 16 bits separately to handle carry
  // Example: x=0x12345678, y=0xABCDEF01
  // lsb = (0x5678 + 0xEF01) = 0x14579
  const lsb = (x & 0xffff) + (y & 0xffff)

  // Add upper 16 bits + carry from lower addition
  // msb = (0x1234 + 0xABCD + (0x14579 >>> 16)) = (0x1234 + 0xABCD + 0x1) = 0xBE02
  const msb = (x >>> 16) + (y >>> 16) + (lsb >>> 16)

  // Combine: upper 16 bits | lower 16 bits (masked to prevent double carry)
  // return (0xBE02 << 16) | (0x14579 & 0xffff) = 0xBE024579
  return (msb << 16) | (lsb & 0xffff)
}

const seedEncoder = new TextEncoder()

/**
 * Convert a string to UTF-8 encoded 32-bit integers (little-endian).
 */
function toIntArray(seed: string): Array<number> {
  const bytes = seedEncoder.encode(seed)
  const result: Array<number> = []

  for (let index = 0; index < bytes.length; index += 4) {
    result.push(
      ((bytes[index] ?? 0) << 0) |
        ((bytes[index + 1] ?? 0) << 8) |
        ((bytes[index + 2] ?? 0) << 16) |
        ((bytes[index + 3] ?? 0) << 24)
    )
  }

  return result
}
