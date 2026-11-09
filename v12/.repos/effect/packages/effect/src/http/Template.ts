/**
 * Builds HTTP response text from template literals.
 *
 * Template interpolations can be plain values, optional values, effects, or
 * streams. The resulting effect or stream keeps the errors and service
 * requirements from any effectful interpolations, which lets response helpers
 * assemble dynamic text without losing type information.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Effect from "../Effect.ts"
import * as Exit from "../Exit.ts"
import * as Option from "../Option.ts"
import * as Stream from "../Stream.ts"

/**
 * Primitive value that can be interpolated into an HTTP template.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type PrimitiveValue = string | number | bigint | boolean | null | undefined

/**
 * Primitive template interpolation value.
 *
 * **Details**
 *
 * Arrays are rendered by converting each element to a string and concatenating the
 * results.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Primitive = PrimitiveValue | ReadonlyArray<PrimitiveValue>

/**
 * Value accepted by the string template constructor.
 *
 * **Details**
 *
 * Interpolations can be primitive values, optional primitive values, or effects
 * that produce primitive values.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Interpolated =
  | Primitive
  | Option.Option<Primitive>
  | Effect.Effect<Primitive, any, any>

/**
 * Value accepted by the streaming template constructor.
 *
 * **Details**
 *
 * In addition to normal interpolations, stream interpolations can emit primitive
 * values over time.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type InterpolatedWithStream = Interpolated | Stream.Stream<Primitive, any, any>

/**
 * Namespace containing type-level helpers for template interpolations.
 *
 * @stability unstable
 * @since 4.0.0
 */
export declare namespace Interpolated {
  /**
   * Extracts the required context from an effect or stream interpolation.
   *
   * **Details**
   *
   * Plain values and `Option` interpolations contribute no context.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export type Context<A> = A extends infer T ? T extends Option.Option<infer _> ? never
    : T extends Effect.Effect<infer _A, infer _E, infer R> ? R
    : T extends Stream.Stream<infer _A, infer _E, infer R> ? R
    : never
    : never

  /**
   * Extracts the error type from an effect or stream interpolation.
   *
   * **Details**
   *
   * Plain values and `Option` interpolations contribute no error type.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export type Error<A> = A extends infer T ? T extends Option.Option<infer _> ? never
    : T extends Stream.Stream<infer _A, infer E, infer _R> ? E
    : T extends Effect.Effect<infer _A, infer E, infer _R> ? E
    : never
    : never
}

/**
 * Creates an effectful string from a template literal.
 *
 * **Details**
 *
 * Primitive and `Option` interpolations are rendered immediately. Effect
 * interpolations are evaluated and rendered before the final string is produced.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export function make<A extends ReadonlyArray<Interpolated>>(
  strings: TemplateStringsArray,
  ...args: A
): Effect.Effect<
  string,
  Interpolated.Error<A[number]>,
  Interpolated.Context<A[number]>
> {
  const argsLength = args.length
  const values = new Array<string>(argsLength)
  const effects: Array<
    [index: number, effect: Effect.Effect<Primitive, any, any>]
  > = []

  for (let i = 0; i < argsLength; i++) {
    const arg = args[i]

    if (Option.isOption(arg)) {
      values[i] = arg._tag === "Some" ? primitiveToString(arg.value) : ""
    } else if (isSuccess(arg)) {
      values[i] = primitiveToString(arg.value)
    } else if (Effect.isEffect(arg)) {
      effects.push([i, arg])
    } else {
      values[i] = primitiveToString(arg)
    }
  }

  if (effects.length === 0) {
    return Effect.succeed(consolidate(strings, values))
  }

  return Effect.map(
    Effect.forEach(
      effects,
      ([index, effect]) =>
        Effect.tap(effect, (value) =>
          Effect.sync(() => {
            values[index] = primitiveToString(value)
          })),
      {
        concurrency: "unbounded",
        discard: true
      }
    ),
    (_) => consolidate(strings, values)
  )
}

/**
 * Creates a stream of strings from a template literal.
 *
 * **Details**
 *
 * Static text is emitted with interpolated values. Effect interpolations are
 * evaluated as stream chunks, and stream interpolations are flattened into the
 * output.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export function stream<A extends ReadonlyArray<InterpolatedWithStream>>(
  strings: TemplateStringsArray,
  ...args: A
): Stream.Stream<
  string,
  Interpolated.Error<A[number]>,
  Interpolated.Context<A[number]>
> {
  const chunks: Array<string | Stream.Stream<string, any, any> | Effect.Effect<string, any, any>> = []
  let buffer = ""

  for (let i = 0, len = args.length; i < len; i++) {
    buffer += strings[i]
    const arg = args[i]
    if (Option.isOption(arg)) {
      buffer += arg._tag === "Some" ? primitiveToString(arg.value) : ""
    } else if (isSuccess(arg)) {
      buffer += primitiveToString(arg.value)
    } else if (Effect.isEffect(arg)) {
      if (buffer.length > 0) {
        chunks.push(buffer)
        buffer = ""
      }
      chunks.push(Effect.map(arg, primitiveToString))
    } else if (Stream.isStream(arg)) {
      if (buffer.length > 0) {
        chunks.push(buffer)
        buffer = ""
      }
      chunks.push(Stream.map(arg, primitiveToString))
    } else {
      buffer += primitiveToString(arg)
    }
  }

  buffer += strings[strings.length - 1]
  if (buffer.length > 0) {
    chunks.push(buffer)
    buffer = ""
  }

  return Stream.fromIterable(chunks).pipe(
    Stream.mapEffect(
      (chunk) => Effect.isEffect(chunk) ? chunk : Effect.succeed(chunk),
      { concurrency: "unbounded" }
    ),
    Stream.flatMap((chunk) => typeof chunk === "string" ? Stream.succeed(chunk) : chunk)
  )
}

function primitiveToString(value: Primitive): string {
  if (Array.isArray(value)) {
    return value.map(primitiveToString).join("")
  }

  switch (typeof value) {
    case "string": {
      return value
    }
    case "number":
    case "bigint": {
      return value.toString()
    }
    case "boolean": {
      return value ? "true" : "false"
    }
    default: {
      return ""
    }
  }
}

function consolidate(
  strings: ReadonlyArray<string>,
  values: ReadonlyArray<string>
): string {
  let out = ""
  for (let i = 0, len = values.length; i < len; i++) {
    out += strings[i]
    out += values[i]
  }
  return out + strings[strings.length - 1]
}

function isSuccess(u: unknown): u is Exit.Success<Primitive, never> {
  return Exit.isExit(u) && u._tag === "Success"
}
