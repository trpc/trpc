/**
 * Service definition for interactive terminal capabilities. Programs can query
 * terminal dimensions, read a line of input, receive low-level key events, and
 * display text without depending directly on a specific platform implementation.
 *
 * This module defines the `Terminal` service, input event shapes, key metadata,
 * the `QuitError` used when a user cancels input, a guard for that error, and a
 * constructor for custom terminal service implementations.
 *
 * @since 4.0.0
 */
import type * as Cause from "./Cause.ts"
import * as Context from "./Context.ts"
import type * as Effect from "./Effect.ts"
import type * as Option from "./Option.ts"
import type { PlatformError } from "./PlatformError.ts"
import * as Predicate from "./Predicate.ts"
import type * as Queue from "./Queue.ts"
import * as Schema from "./Schema.ts"
import type * as Scope from "./Scope.ts"

const TypeId = "~effect/Terminal"

/**
 * A `Terminal` represents a command-line interface which can read input from a
 * user and display messages to a user.
 *
 * @category services
 * @since 4.0.0
 */
export interface Terminal {
  readonly [TypeId]: typeof TypeId

  /**
   * The number of columns available on the platform's terminal interface.
   */
  readonly columns: Effect.Effect<number>
  /**
   * The number of rows available on the platform's terminal interface.
   */

  readonly rows: Effect.Effect<number>
  /**
   * Reads input events from the default standard input.
   */
  readonly readInput: Effect.Effect<Queue.Dequeue<UserInput, Cause.Done>, never, Scope.Scope>
  /**
   * Reads a single line from the default standard input.
   */
  readonly readLine: Effect.Effect<string, QuitError>
  /**
   * Displays text to the default standard output.
   */
  readonly display: (text: string) => Effect.Effect<void, PlatformError>
}

/**
 * Keyboard key metadata for terminal input, including the key name and
 * modifier state.
 *
 * @category models
 * @since 4.0.0
 */
export interface Key {
  /**
   * The name of the key being pressed.
   */
  readonly name: string
  /**
   * If set to `true`, then the user is also holding down the `Ctrl` key.
   */
  readonly ctrl: boolean
  /**
   * If set to `true`, then the user is also holding down the `Meta` key.
   */
  readonly meta: boolean
  /**
   * If set to `true`, then the user is also holding down the `Shift` key.
   */
  readonly shift: boolean
}

/**
 * A terminal input event containing an optional raw character and the parsed
 * key that was pressed.
 *
 * **When to use**
 *
 * Use when consuming low-level terminal input events from `Terminal.readInput`
 * and you need both raw character input and parsed key metadata.
 *
 * @see {@link Key} for the parsed key metadata stored on each input event
 *
 * @category models
 * @since 4.0.0
 */
export interface UserInput {
  /**
   * The character read from the user (if any).
   */
  readonly input: Option.Option<string>
  /**
   * The key that the user pressed.
   */
  readonly key: Key
}

const QuitErrorTypeId = "~effect/Terminal/QuitError"

/**
 * Represents an error that occurs when a user attempts to
 * quit out of a `Terminal` prompt for input (usually by entering `ctrl`+`c`).
 *
 * **When to use**
 *
 * Use when implementing terminal input or prompts that need to signal
 * user-requested cancellation through the typed error channel.
 *
 * @see {@link isQuitError} for checking unknown errors when handling terminal cancellation
 *
 * @category errors
 * @since 4.0.0
 */
export class QuitError extends Schema.Error<QuitError>("QuitError")({
  _tag: Schema.tag("QuitError")
}) {
  /**
   * Marks this value as a terminal quit error for runtime guards.
   *
   * @since 4.0.0
   */
  readonly [QuitErrorTypeId] = QuitErrorTypeId
}

/**
 * Returns `true` if the provided value is a `Terminal.QuitError`.
 *
 * **When to use**
 *
 * Use to narrow unknown failures to `QuitError` when handling terminal input
 * cancellation.
 *
 * **Details**
 *
 * Returns `true` when the value carries the `QuitError` runtime marker and
 * narrows it to `QuitError`.
 *
 * @see {@link QuitError} for the error value produced when terminal input is quit
 *
 * @category guards
 * @since 4.0.0
 */
export const isQuitError = (u: unknown): u is QuitError => Predicate.hasProperty(u, QuitErrorTypeId)

/**
 * Service tag for command-line input and output services.
 *
 * **When to use**
 *
 * Use to access or provide platform terminal capabilities such as reading
 * input, writing output, and inspecting terminal dimensions.
 *
 * @category services
 * @since 4.0.0
 */
export const Terminal: Context.Service<Terminal, Terminal> = Context.Service("effect/Terminal")

/**
 * Creates a `Terminal` service implementation.
 *
 * **When to use**
 *
 * Use to construct a custom `Terminal` service implementation from concrete
 * terminal capabilities when writing a platform adapter, test implementation,
 * or custom runtime service.
 *
 * **Details**
 *
 * The implementation object supplies `columns`, `rows`, `readInput`,
 * `readLine`, and `display`; `make` attaches the `Terminal` service marker so
 * the result can be provided through the `Terminal` context service.
 *
 * @category constructors
 * @since 4.0.0
 */
export const make = (
  impl: Omit<Terminal, typeof TypeId>
): Terminal => Terminal.of({ ...impl, [TypeId]: TypeId })
