import type { AnyORPCError, ORPCErrorCode } from '@orpc/server'
import { ORPCError } from '@orpc/server'
import { getOwn } from '@orpc/shared'
import { Effect, Function } from 'effect'

/**
 * Recovers from `ORPCError` failures in the error channel of an effect.
 * Other failures re-fail with their original cause. Because failure types
 * like `Error` can also hold `ORPCError` instances at runtime, the handler
 * can also receive such hidden errors with unknown code and data.
 *
 * Supports both data-first `catchORPCError(effect, handler)` and data-last
 * `effect.pipe(catchORPCError(handler))` styles.
 *
 * @example
 * ```ts
 * declare const program: Effect.Effect<string, ORPCError<'NOT_FOUND', undefined> | TypeError>
 *
 * const recovered = program.pipe(
 *   catchORPCError(error => Effect.succeed(`caught ${error.code}`)),
 * )
 * ```
 *
 * @see {@link https://orpc.dev/docs/integrations/effect#catching-orpcerrors | Effect Integration - Catching ORPCErrors}
 */
export const catchORPCError: {
  <E, A2, E2, R2>(
    f: (error: E extends AnyORPCError ? E : AnyORPCError extends E ? ORPCError<ORPCErrorCode, unknown> : never) => Effect.Effect<A2, E2, R2>,
  ): <A, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A | A2, E2 | Exclude<E, AnyORPCError>, R | R2>
  <A, E, R, A2, E2, R2>(
    self: Effect.Effect<A, E, R>,
    f: (error: E extends AnyORPCError ? E : AnyORPCError extends E ? ORPCError<ORPCErrorCode, unknown> : never) => Effect.Effect<A2, E2, R2>,
  ): Effect.Effect<A | A2, E2 | Exclude<E, AnyORPCError>, R | R2>
} = Function.dual(
  2,
  (
    self: Effect.Effect<any, any, any>,
    f: (error: AnyORPCError) => Effect.Effect<any, any, any>,
  ) => self.pipe(
    Effect.catchIf((error): error is AnyORPCError => error instanceof ORPCError, f),
  ),
)

/**
 * Recovers from `ORPCError` failures with a matching code in the error channel of an effect.
 * Other failures re-fail with their original cause. The `code` argument is
 * suggested and restricted to the codes present in the error channel, and is
 * unrestricted when the channel contains failure types like `Error` that can
 * hold hidden `ORPCError` instances, whose data is unknown.
 *
 * Supports both data-first `catchORPCErrorCode(effect, code, handler)` and
 * data-last `effect.pipe(catchORPCErrorCode(code, handler))` styles.
 *
 * @example
 * ```ts
 * declare const program: Effect.Effect<
 *   string,
 *   ORPCError<'NOT_FOUND', { id: string }> | ORPCError<'CONFLICT', undefined>
 * >
 *
 * const recovered = program.pipe(
 *   catchORPCErrorCode('NOT_FOUND', error => Effect.succeed(error.data.id)),
 * )
 * ```
 *
 * @see {@link https://orpc.dev/docs/integrations/effect#catching-orpcerrors | Effect Integration - Catching ORPCErrors}
 */
export const catchORPCErrorCode: {
  <const TCode extends E extends ORPCError<infer TCode, any> ? TCode : AnyORPCError extends E ? ORPCErrorCode : never, E, A2, E2, R2>(
    code: TCode,
    f: (error: E extends AnyORPCError ? Extract<E, ORPCError<TCode, any>> : AnyORPCError extends E ? ORPCError<TCode, unknown> : never) => Effect.Effect<A2, E2, R2>,
  ): <A, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A | A2, E2 | Exclude<E, ORPCError<TCode, any>>, R | R2>
  <A, E, R, const TCode extends E extends ORPCError<infer TCode, any> ? TCode : AnyORPCError extends E ? ORPCErrorCode : never, A2, E2, R2>(
    self: Effect.Effect<A, E, R>,
    code: TCode,
    f: (error: E extends AnyORPCError ? Extract<E, ORPCError<TCode, any>> : AnyORPCError extends E ? ORPCError<TCode, unknown> : never) => Effect.Effect<A2, E2, R2>,
  ): Effect.Effect<A | A2, E2 | Exclude<E, ORPCError<TCode, any>>, R | R2>
} = Function.dual(
  3,
  (
    self: Effect.Effect<any, any, any>,
    code: ORPCErrorCode,
    f: (error: AnyORPCError) => Effect.Effect<any, any, any>,
  ) => self.pipe(
    Effect.catchIf((error): error is AnyORPCError => error instanceof ORPCError && error.code === code, f),
  ),
)

/**
 * Recovers from `ORPCError` failures using a map of codes to handlers in the
 * error channel of an effect. Other failures re-fail with their original
 * cause. The keys are suggested and restricted to the codes present in the
 * error channel, and are unrestricted when the channel contains failure types
 * like `Error` that can hold hidden `ORPCError` instances, whose data is unknown.
 *
 * Supports both data-first `catchORPCErrorCodes(effect, cases)` and data-last
 * `effect.pipe(catchORPCErrorCodes(cases))` styles.
 *
 * @example
 * ```ts
 * declare const program: Effect.Effect<
 *   string,
 *   ORPCError<'NOT_FOUND', { id: string }> | ORPCError<'CONFLICT', undefined>
 * >
 *
 * const recovered = program.pipe(
 *   catchORPCErrorCodes({
 *     NOT_FOUND: error => Effect.succeed(error.data.id),
 *     CONFLICT: error => Effect.succeed(error.message),
 *   }),
 * )
 * ```
 *
 * @see {@link https://orpc.dev/docs/integrations/effect#catching-orpcerrors | Effect Integration - Catching ORPCErrors}
 */
export const catchORPCErrorCodes: {
  <
    E,
    Cases extends
    & { [K in E extends ORPCError<infer TCode, any> ? TCode : AnyORPCError extends E ? ORPCErrorCode : never]?: string extends K
      ? (error: never) => Effect.Effect<any, any, any>
      : K extends infer C extends ORPCErrorCode
        ? (error: E extends AnyORPCError ? Extract<E, ORPCError<C, any>> : AnyORPCError extends E ? ORPCError<C, unknown> : never) => Effect.Effect<any, any, any>
        : never }
        & { [K in Exclude<keyof Cases, E extends ORPCError<infer TCode, any> ? TCode : AnyORPCError extends E ? ORPCErrorCode : never>]: never },
  >(
    cases: Cases,
  ): <A, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<
    A | { [K in keyof Cases]: Cases[K] extends (...args: any[]) => Effect.Effect<infer A2, any, any> ? A2 : never }[keyof Cases],
    | Exclude<E, ORPCError<keyof Cases & ORPCErrorCode, any>>
    | { [K in keyof Cases]: Cases[K] extends (...args: any[]) => Effect.Effect<any, infer E2, any> ? E2 : never }[keyof Cases],
    R | { [K in keyof Cases]: Cases[K] extends (...args: any[]) => Effect.Effect<any, any, infer R2> ? R2 : never }[keyof Cases]
  >
  <
    A,
    E,
    R,
    Cases extends
    & { [K in E extends ORPCError<infer TCode, any> ? TCode : AnyORPCError extends E ? ORPCErrorCode : never]?: string extends K
      ? (error: never) => Effect.Effect<any, any, any>
      : K extends infer C extends ORPCErrorCode
        ? (error: E extends AnyORPCError ? Extract<E, ORPCError<C, any>> : AnyORPCError extends E ? ORPCError<C, unknown> : never) => Effect.Effect<any, any, any>
        : never }
        & { [K in Exclude<keyof Cases, E extends ORPCError<infer TCode, any> ? TCode : AnyORPCError extends E ? ORPCErrorCode : never>]: never },
  >(
    self: Effect.Effect<A, E, R>,
    cases: Cases,
  ): Effect.Effect<
    A | { [K in keyof Cases]: Cases[K] extends (...args: any[]) => Effect.Effect<infer A2, any, any> ? A2 : never }[keyof Cases],
    | Exclude<E, ORPCError<keyof Cases & ORPCErrorCode, any>>
    | { [K in keyof Cases]: Cases[K] extends (...args: any[]) => Effect.Effect<any, infer E2, any> ? E2 : never }[keyof Cases],
    R | { [K in keyof Cases]: Cases[K] extends (...args: any[]) => Effect.Effect<any, any, infer R2> ? R2 : never }[keyof Cases]
  >
} = Function.dual(
  2,
  (
    self: Effect.Effect<any, any, any>,
    cases: Record<string, ((error: AnyORPCError) => Effect.Effect<any, any, any>) | undefined>,
  ) => self.pipe(
    Effect.catchIf(
      (error): error is AnyORPCError => error instanceof ORPCError && typeof getOwn(cases, error.code) === 'function',
      error => getOwn(cases, error.code)!(error),
    ),
  ),
)
