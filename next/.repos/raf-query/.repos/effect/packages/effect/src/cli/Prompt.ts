/**
 * Builds interactive terminal prompts for CLI applications.
 *
 * A `Prompt<A>` describes a small terminal UI that renders frames, reads
 * keyboard input, validates responses, and eventually produces an `A`. Prompts
 * can ask for simple values, selections, lists, files, hidden text, or custom
 * interactions. This module includes prompt constructors, tools for combining
 * and transforming prompt output, and support for running prompts through the
 * `Terminal` service.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Arr from "../Array.ts"
import type { NoSuchElementError } from "../Cause.ts"
import type * as Cause from "../Cause.ts"
import * as Context from "../Context.ts"
import * as Data from "../Data.ts"
import * as Effect from "../Effect.ts"
import * as Effectable from "../Effectable.ts"
import * as FileSystem from "../FileSystem.ts"
import { dual, pipe } from "../Function.ts"
import * as EffectNumber from "../Number.ts"
import * as Option from "../Option.ts"
import * as Path from "../Path.ts"
import * as Predicate from "../Predicate.ts"
import * as Queue from "../Queue.ts"
import * as Redacted from "../Redacted.ts"
import * as Terminal from "../Terminal.ts"
import type { Covariant } from "../Types.ts"
import * as Ansi from "./internal/ansi.ts"
import type * as Primitive from "./Primitive.ts"

declare const process: {
  readonly platform: string
  readonly cwd: () => string
}

const TypeId = "~effect/cli/Prompt"

/**
 * Represents an interactive terminal prompt that produces an `Output` value.
 *
 * **Details**
 *
 * A `Prompt` is an `Effect` that may fail with `Terminal.QuitError` and
 * requires the prompt environment needed to render frames, read input, and
 * access files or paths when a prompt uses them.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Prompt<Output> extends Effect.Effect<Output, Terminal.QuitError, Environment> {
  readonly [TypeId]: {
    readonly _Output: Covariant<Output>
  }
}

/**
 * Returns `true` if the provided value is a `Prompt`.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isPrompt = (u: unknown): u is Prompt<unknown> => Predicate.hasProperty(u, TypeId)

/**
 * Represents the services available to a custom `Prompt`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Environment = FileSystem.FileSystem | Path.Path | Terminal.Terminal

/**
 * Represents the action that should be taken by a `Prompt` based upon user
 * input or an external event received during the current frame.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Action<State, Output> = Data.TaggedEnum<{
  readonly Beep: {}
  readonly NextFrame: { readonly state: State }
  readonly Submit: { readonly value: Output }
}>

/**
 * Type-level definition for the tagged `Prompt.Action` variants.
 *
 * **Details**
 *
 * It connects the action state and output type parameters to the `Beep`,
 * `NextFrame`, and `Submit` action cases.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ActionDefinition extends Data.TaggedEnum.WithGenerics<2> {
  readonly taggedEnum: Action<this["A"], this["B"]>
}

/**
 * Represents the input that should be processed by a `Prompt` based upon user
 * input or an external event received during the current frame.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type ProcessInput<A> = Data.TaggedEnum<{
  readonly Input: { readonly input: Terminal.UserInput }
  readonly Event: { readonly value: A }
}>

/**
 * Represents the set of handlers used by a `Prompt`.
 *
 * **Details**
 *
 * The handlers render the current frame, process user input into the next
 * `Prompt.Action`, and clear the terminal screen before the next frame.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Handlers<State, Output, Input = Terminal.UserInput> {
  /**
   * A function that is called to render the current frame of the `Prompt`.
   */
  readonly render: (
    state: State,
    action: Action<State, Output>
  ) => Effect.Effect<string, never, Environment>
  /**
   * A function that is called to process user input and determine the next
   * `Prompt.Action` that should be taken.
   */
  readonly process: (
    input: Input,
    state: State
  ) => Effect.Effect<Action<State, Output>, never, Environment>
  /**
   * A function that is called to clear the terminal screen before rendering
   * the next frame of the `Prompt`.
   */
  readonly clear: (
    state: State,
    action: Action<State, Output>
  ) => Effect.Effect<string, never, Environment>
}

/**
 * Defines the symbols used to render built-in prompts.
 *
 * **Details**
 *
 * Set a symbol to an empty string to omit both the symbol and its adjacent
 * spacing.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Theme {
  /** The leading symbol on an active prompt line. */
  readonly prefix: string
  /** The marker for the highlighted choice. */
  readonly pointer: string
  /** The trailing prompt and validation marker. */
  readonly pointerSmall: string
  /** The marker shown when a prompt has been submitted. */
  readonly ellipsis: string
  /** The leading symbol on a completed prompt line. */
  readonly tick: string
  /** The marker indicating choices above the current page. */
  readonly arrowUp: string
  /** The marker indicating choices below the current page. */
  readonly arrowDown: string
  /** The marker for a selected multi-select choice. */
  readonly checkboxOn: string
  /** The marker for an unselected multi-select choice. */
  readonly checkboxOff: string
  /** The separator between a choice and its description. */
  readonly descriptionSeparator: string
  /** The character used to mask password input. */
  readonly passwordMask: string
  /** The separator between toggle labels. */
  readonly toggleSeparator: string
  /** The color used for active prompt elements. */
  readonly primaryColor: string
  /** The color used for secondary prompt elements. */
  readonly mutedColor: string
  /** The color used for completed prompt markers. */
  readonly successColor: string
  /** The color used for validation errors. */
  readonly errorColor: string
  /** The color used for submitted values. */
  readonly submittedColor: string
}

/**
 * Options shared by built-in prompts that support theme overrides.
 *
 * @stability unstable
 * @category options
 * @since 4.0.0
 */
export interface ThemeOptions {
  /** Overrides the context theme for this prompt. */
  readonly theme?: Partial<Theme>
}

type OptionsReq<A> = Required<Omit<A, "theme">> & ThemeOptions

/**
 * Options for a confirmation prompt that asks the user to choose a boolean
 * yes/no value.
 *
 * @stability unstable
 * @category options
 * @since 4.0.0
 */
export interface ConfirmOptions extends ThemeOptions {
  /**
   * The message to display in the prompt.
   */
  readonly message: string
  /**
   * The initial value of the confirm prompt (defaults to `false`).
   */
  readonly initial?: boolean
  /**
   * The label to display after a user has responded to the prompt.
   */
  readonly label?: {
    /**
     * The label used if the prompt is confirmed (defaults to `"yes"`).
     */
    readonly confirm: string
    /**
     * The label used if the prompt is not confirmed (defaults to `"no"`).
     */
    readonly deny: string
  }
  /**
   * The placeholder to display when a user is responding to the prompt.
   */
  readonly placeholder?: {
    /**
     * The placeholder to use if the `initial` value of the prompt is `true`
     * (defaults to `"(Y/n)"`).
     */
    readonly defaultConfirm?: string
    /**
     * The placeholder to use if the `initial` value of the prompt is `false`
     * (defaults to `"(y/N)"`).
     */
    readonly defaultDeny?: string
  }
}

/**
 * Options for a date prompt, including the displayed message, initial value,
 * format mask, validation, and locale labels.
 *
 * @stability unstable
 * @category options
 * @since 4.0.0
 */
export interface DateOptions extends ThemeOptions {
  /**
   * The message to display in the prompt.
   */
  readonly message: string
  /**
   * The initial date value to display in the prompt (defaults to the current
   * date).
   */
  readonly initial?: globalThis.Date
  /**
   * The format mask of the date (defaults to `YYYY-MM-DD HH:mm:ss`).
   */
  readonly dateMask?: string
  /**
   * An effectful function that can be used to validate the value entered into
   * the prompt before final submission.
   */
  readonly validate?: (value: globalThis.Date) => Effect.Effect<globalThis.Date, string>
  /**
   * Custom locales that can be used in place of the defaults.
   */
  readonly locales?: {
    /**
     * The full names of each month of the year.
     */
    readonly months: [
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string
    ]
    /**
     * The short names of each month of the year.
     */
    readonly monthsShort: [
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string
    ]
    /**
     * The full names of each day of the week.
     */
    readonly weekdays: [string, string, string, string, string, string, string]
    /**
     * The short names of each day of the week.
     */
    readonly weekdaysShort: [string, string, string, string, string, string, string]
  }
}

/**
 * Options for an integer prompt, including bounds, keyboard step sizes, and
 * additional validation.
 *
 * @stability unstable
 * @category options
 * @since 4.0.0
 */
export interface IntOptions extends ThemeOptions {
  /**
   * The message to display in the prompt.
   */
  readonly message: string
  /**
   * The default value of the integer prompt.
   */
  readonly default?: number
  /**
   * The minimum value that can be entered by the user (defaults to `-Infinity`).
   */
  readonly min?: number
  /**
   * The maximum value that can be entered by the user (defaults to `Infinity`).
   */
  readonly max?: number
  /**
   * The value that will be used to increment the prompt value when using the
   * up arrow key (defaults to `1`).
   */
  readonly incrementBy?: number
  /**
   * The value that will be used to decrement the prompt value when using the
   * down arrow key (defaults to `1`).
   */
  readonly decrementBy?: number
  /**
   * An effectful function that can be used to validate the value entered into
   * the prompt before final submission.
   */
  readonly validate?: (value: number) => Effect.Effect<number, string>
}

/**
 * Options for `Number`, extending `IntOptions` with display precision.
 *
 * @stability unstable
 * @category options
 * @since 4.0.0
 */
export interface NumberOptions extends IntOptions {
  /**
   * The precision to use for the floating point value (defaults to `2`).
   */
  readonly precision?: number
}

/**
 * Options for a text prompt that returns a list of strings by splitting the
 * input on a delimiter.
 *
 * @stability unstable
 * @category options
 * @since 4.0.0
 */
export interface ListOptions extends TextOptions {
  /**
   * The delimiter that separates list entries.
   */
  readonly delimiter?: string
}

/**
 * Options for a file-system selection prompt.
 *
 * **Details**
 *
 * They control which path type can be selected, the starting directory, paging,
 * and filtering of displayed entries.
 *
 * @stability unstable
 * @category options
 * @since 4.0.0
 */
export interface FileOptions extends ThemeOptions {
  /**
   * The path type that will be selected, defaulting to `"file"`.
   */
  readonly type?: Primitive.PathType
  /**
   * The message to display in the prompt, defaulting to `"Choose a file"`.
   */
  readonly message?: string
  /**
   * Where the user will initially be prompted to select files from, defaulting
   * to the current working directory.
   */
  readonly startingPath?: string
  /**
   * The default path to select when the prompt is first displayed.
   */
  readonly default?: string
  /**
   * The number of choices to display at one time, defaulting to `10`.
   */
  readonly maxPerPage?: number
  /**
   * A predicate or effect that keeps a file in the prompt when it returns
   * `true`, defaulting to returning all files.
   */
  readonly filter?: (file: string) => boolean | Effect.Effect<boolean, never, Environment>
}

/**
 * Options for a prompt that asks the user to select one value from a list of
 * choices.
 *
 * @stability unstable
 * @category options
 * @since 4.0.0
 */
export interface SelectOptions<A> extends ThemeOptions {
  /**
   * The prompt message. Omit to display only the choices.
   */
  readonly message?: string | undefined
  /**
   * The choices to display to the user.
   */
  readonly choices: ReadonlyArray<SelectChoice<A>>
  /**
   * The number of choices to display at one time (defaults to `10`).
   */
  readonly maxPerPage?: number
}

/**
 * Options for an autocomplete prompt that lets the user filter selectable
 * choices by typing.
 *
 * @stability unstable
 * @category options
 * @since 4.0.0
 */
export interface AutoCompleteOptions<A> extends SelectOptions<A> {
  /**
   * The required prompt message.
   */
  readonly message: string
  /**
   * The label used for the filter display (defaults to "filter").
   */
  readonly filterLabel?: string
  /**
   * The placeholder shown when the filter is empty (defaults to "type to filter").
   */
  readonly filterPlaceholder?: string
  /**
   * The message displayed when no choices match (defaults to "No matches").
   */
  readonly emptyMessage?: string
}

/**
 * Options for a multi-select prompt, including bulk-selection labels and
 * minimum or maximum selection counts.
 *
 * @stability unstable
 * @category options
 * @since 4.0.0
 */
export interface MultiSelectOptions {
  /**
   * Text for the "Select All" option (defaults to "Select All").
   */
  readonly selectAll?: string
  /**
   * Text for the "Select None" option (defaults to "Select None").
   */
  readonly selectNone?: string
  /**
   * Text for the "Inverse Selection" option (defaults to "Inverse Selection").
   */
  readonly inverseSelection?: string
  /**
   * The minimum number of choices that must be selected.
   */
  readonly min?: number
  /**
   * The maximum number of choices that can be selected.
   */
  readonly max?: number
}

/**
 * Represents one choice displayed by select, autocomplete, and multi-select
 * prompts.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface SelectChoice<A> {
  /**
   * The name of the select option that is displayed to the user.
   */
  readonly title: string
  /**
   * The underlying value of the select option.
   */
  readonly value: A
  /**
   * An optional description for the select option which will be displayed
   * to the user.
   */
  readonly description?: string
  /**
   * Whether or not this select option is disabled.
   */
  readonly disabled?: boolean
  /**
   * Whether this option should be selected by default (only used by MultiSelect).
   */
  readonly selected?: boolean
}

/**
 * Options for text-entry prompts, including the displayed message, default
 * text, and effectful validation before submission.
 *
 * @stability unstable
 * @category options
 * @since 4.0.0
 */
export interface TextOptions extends ThemeOptions {
  /**
   * The message to display in the prompt.
   */
  readonly message: string
  /**
   * The default value of the text option.
   */
  readonly default?: string
  /**
   * An effectful function that can be used to validate the value entered into
   * the prompt before final submission.
   */
  readonly validate?: (value: string) => Effect.Effect<string, string>
}

/**
 * Options for a toggle prompt that lets the user switch between active and
 * inactive boolean states.
 *
 * @stability unstable
 * @category options
 * @since 4.0.0
 */
export interface ToggleOptions extends ThemeOptions {
  /**
   * The message to display in the prompt.
   */
  readonly message: string
  /**
   * The intitial value of the toggle prompt (defaults to `false`).
   */
  readonly initial?: boolean
  /**
   * The text to display when the toggle is in the active state (defaults to
   * `on`).
   */
  readonly active?: string
  /**
   * The text to display when the toggle is in the inactive state (defaults to
   * `off`).
   */
  readonly inactive?: string
}

const defaultTheme: Theme = {
  prefix: "?",
  arrowUp: "↑",
  arrowDown: "↓",
  checkboxOn: "☒",
  checkboxOff: "☐",
  tick: "✔",
  ellipsis: "…",
  pointerSmall: "›",
  pointer: "❯",
  descriptionSeparator: "- ",
  passwordMask: "*",
  toggleSeparator: "/",
  primaryColor: Ansi.cyanBright,
  mutedColor: Ansi.blackBright,
  successColor: Ansi.green,
  errorColor: Ansi.red,
  submittedColor: Ansi.white
}

const windowsTheme: Theme = {
  ...defaultTheme,
  checkboxOn: "[*]",
  checkboxOff: "[ ]",
  tick: "√",
  ellipsis: "...",
  pointerSmall: "»",
  pointer: ">"
}

/**
 * Creates a prompt theme using the current platform defaults.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeTheme = (options?: Partial<Theme>): Theme => ({
  ...(process.platform === "win32" ? windowsTheme : defaultTheme),
  ...options
})

/**
 * Context reference for the theme used by built-in prompts.
 *
 * **Details**
 *
 * Provide this reference once to theme every prompt in an application. A
 * prompt's `theme` option takes precedence over the context value.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const Theme: Context.Reference<Theme> = Context.Reference("effect/cli/Prompt/Theme", {
  defaultValue: makeTheme
})

const getTheme = (options: ThemeOptions): Effect.Effect<Theme> =>
  Effect.map(Theme, (theme) => ({ ...theme, ...options.theme }))

/**
 * Type alias for any `Prompt`, regardless of its output type.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type Any = Prompt<unknown>

/**
 * Namespace containing return-type helpers for `Prompt.all`.
 *
 * @stability unstable
 * @since 4.0.0
 */
export declare namespace All {
  /**
   * Computes the prompt returned by `Prompt.all` for an iterable of prompts.
   *
   * **Details**
   *
   * The resulting prompt produces an array of each prompt's output value.
   *
   * @stability unstable
   * @category utility types
   * @since 4.0.0
   */
  export type ReturnIterable<T extends Iterable<Any>> = [T] extends [Iterable<Prompt<infer A>>] ? Prompt<Array<A>>
    : never

  /**
   * Computes the prompt returned by `Prompt.all` for a readonly tuple or array
   * of prompts, preserving tuple positions in the output type.
   *
   * @stability unstable
   * @category utility types
   * @since 4.0.0
   */
  export type ReturnTuple<T extends ReadonlyArray<unknown>> = Prompt<
    T[number] extends never ? []
      : { -readonly [K in keyof T]: [T[K]] extends [Prompt<infer _A>] ? _A : never }
  > extends infer X ? X : never

  /**
   * Computes the prompt returned by `Prompt.all` for a record of prompts,
   * preserving the record keys and replacing each prompt with its output type.
   *
   * @stability unstable
   * @category utility types
   * @since 4.0.0
   */
  export type ReturnObject<T> = [T] extends [{ [K: string]: Any }] ? Prompt<
      {
        -readonly [K in keyof T]: [T[K]] extends [Prompt<infer _A>] ? _A : never
      }
    >
    : never

  /**
   * Computes the return prompt type for `Prompt.all` based on the input
   * structure.
   *
   * @stability unstable
   * @category constructors
   * @since 4.0.0
   */
  export type Return<
    Arg extends Iterable<Any> | Record<string, Any>
  > = [Arg] extends [ReadonlyArray<Any>] ? ReturnTuple<Arg>
    : [Arg] extends [Iterable<Any>] ? ReturnIterable<Arg>
    : [Arg] extends [Record<string, Any>] ? ReturnObject<Arg>
    : never
}

/**
 * Runs all the provided prompts in sequence respecting the structure provided
 * in input.
 *
 * **Details**
 *
 * Supports either a tuple / iterable of prompts or a record / struct of prompts
 * as an argument.
 *
 * **Example** (Collecting prompt results)
 *
 * ```ts import.meta.vitest
 * import { Effect, FileSystem, Layer, Path, Terminal } from "effect"
 * import { Prompt } from "effect/cli"
 *
 * const terminal = Terminal.make({
 *   columns: Effect.succeed(80),
 *   rows: Effect.succeed(24),
 *   readInput: Effect.succeed({} as never),
 *   readLine: Effect.die("unused"),
 *   display: () => Effect.void
 * })
 * const services = Layer.mergeAll(
 *   FileSystem.layerNoop({}),
 *   Path.layer,
 *   Layer.succeed(Terminal.Terminal, terminal)
 * )
 *
 * const username = Prompt.succeed("alice")
 * const password = Prompt.succeed("secret")
 *
 * const allWithTuple = Prompt.all([username, password])
 *
 * const allWithRecord = Prompt.all({ username, password })
 *
 * await Effect.runPromise(Effect.provide(allWithTuple, services)) // => ["alice", "secret"]
 * await Effect.runPromise(Effect.provide(allWithRecord, services)) // => { username: "alice", password: "secret" }
 * ```
 *
 * @stability unstable
 * @category combining
 * @since 4.0.0
 */
export const all: <
  const Arg extends Iterable<Prompt<any>> | Record<string, Prompt<any>>
>(arg: Arg) => All.Return<Arg> = function() {
  if (arguments.length === 1) {
    if (isPrompt(arguments[0])) {
      return map(arguments[0], (x) => [x]) as any
    } else if (Predicate.isIterable(arguments[0])) {
      return allTupled(Arr.fromIterable(arguments[0] as Iterable<Prompt<any>>)) as any
    } else {
      const entries = Object.entries(arguments[0] as Readonly<{ [K: string]: Prompt<any> }>)
      if (entries.length === 0) {
        return succeed({}) as any
      }
      let result = map(entries[0][1], (value) => ({ [entries[0][0]]: value }))
      if (entries.length === 1) {
        return result as any
      }
      const rest = entries.slice(1)
      for (const [key, prompt] of rest) {
        result = result.pipe(
          flatMap((record) =>
            prompt.pipe(map((value) => ({
              ...record,
              [key]: value
            })))
          )
        )
      }
      return result as any
    }
  }
  return allTupled(arguments[0]) as any
}

const annotateLine = (line: string): string => Ansi.annotate(line, Ansi.bold)
const annotateErrorLine = (line: string, color: string): string =>
  Ansi.annotate(line, Ansi.combine(Ansi.italicized, color))
const annotateSymbol = (symbol: string, ...styles: Array<string | Array<string>>): string =>
  symbol.length === 0 ? "" : Ansi.annotate(symbol, ...styles)
const separateSymbol = (symbol: string, text: string): string => symbol.length === 0 ? text : symbol + " " + text
const renderPagingPrefix = (theme: Theme, showArrowUp: boolean, showArrowDown: boolean): string => {
  const width = Math.max(theme.arrowUp.length, theme.arrowDown.length)
  if (showArrowUp) {
    return theme.arrowUp.padEnd(width)
  }
  if (showArrowDown) {
    return theme.arrowDown.padEnd(width)
  }
  return " ".repeat(width)
}

/**
 * Creates a confirmation prompt that asks the user to choose a boolean yes/no
 * value.
 *
 * **When to use**
 *
 * Use to ask for a yes/no answer that can be submitted directly.
 *
 * **Details**
 *
 * `initial` defaults to `false`. Enter submits the current default, yes-style
 * input submits `true`, no-style input submits `false`, and other input beeps.
 *
 * @see {@link Toggle} for an interactive switch-before-submit boolean prompt
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const Confirm = (options: ConfirmOptions): Prompt<boolean> => {
  const opts: ConfirmOptionsReq = {
    initial: false,
    ...options,
    label: {
      confirm: "yes",
      deny: "no",
      ...options.label
    },
    placeholder: {
      defaultConfirm: "(Y/n)",
      defaultDeny: "(y/N)",
      ...options.placeholder
    }
  }
  const initialState: ConfirmState = { value: opts.initial }
  return Custom(initialState, {
    render: handleConfirmRender(opts),
    process: (input) => handleConfirmProcess(input, opts.initial),
    clear: handleConfirmClear(opts)
  })
}

/**
 * Creates a custom `Prompt` from the specified initial state and handlers.
 *
 * **Details**
 *
 * The initial state can either be a pure value or an `Effect`. This is
 * particularly useful when the initial state of the `Prompt` must be computed
 * by performing an effectful computation, such as reading data from the file
 * system. A `Prompt` runs as a render loop: `render` returns ANSI output for
 * the current frame, the `Terminal` obtains user input, `process` returns the
 * next prompt action, and `clear` returns ANSI output used to clear the previous
 * frame.
 *
 * Optionally, an external `events` dequeue can be provided as the third
 * argument. When present, the render loop will race user input against events
 * from the dequeue, allowing background events to trigger re-renders without
 * waiting for a keypress. When an event is received from the dequeue, the
 * `receive` handler is called instead of `process`.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const Custom: {
  <State, Output>(
    initialState: State | Effect.Effect<State, never, Environment>,
    handlers: Handlers<State, Output>
  ): Prompt<Output>
  <State, Output, A>(
    initialState: State | Effect.Effect<State, never, Environment>,
    events: Queue.Dequeue<A, never>,
    handlers: Handlers<State, Output, ProcessInput<A>>
  ): Prompt<Output>
} = <State, Output, A>(
  initialState: State | Effect.Effect<State, never, Environment>,
  ...args:
    | [handlers: Handlers<State, Output, Terminal.UserInput>]
    | [events: Queue.Dequeue<A, never>, handlers: Handlers<State, Output, ProcessInput<A>>]
): Prompt<Output> => {
  const [events, handlers] = args.length === 1
    ? [undefined, args[0]] as const
    : [args[0], args[1]] as const
  const op = Object.create(proto)
  op._tag = "Loop"
  op.initialState = initialState
  op.render = handlers.render
  op.process = handlers.process
  op.clear = handlers.clear
  op.events = events
  return op
}

/**
 * Creates a date prompt that lets the user edit a formatted date value and
 * validates the final `Date` before submission.
 *
 * **Details**
 *
 * `initial` defaults to the current `Date`, `dateMask` defaults to
 * `YYYY-MM-DD HH:mm:ss`, mask parsing creates editable date parts plus literal
 * tokens, `locales` customizes month and weekday labels, and `validate` runs on
 * submission.
 *
 * **Gotchas**
 *
 * A supplied `initial` `Date` is edited in place during prompt interaction.
 * Date edits use JavaScript `Date` setters, so out-of-range typed values can
 * normalize before validation. If the prompt is meant to be editable,
 * `dateMask` should contain at least one editable date token.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const Date = (options: DateOptions): Prompt<globalThis.Date> => {
  const opts: DateOptionsReq = {
    initial: new globalThis.Date(),
    dateMask: "YYYY-MM-DD HH:mm:ss",
    validate: Effect.succeed,
    ...options,
    locales: {
      ...defaultLocales,
      ...options.locales
    }
  }
  const dateParts = makeDateParts(opts.dateMask, opts.initial, opts.locales)
  const initialCursorPosition = dateParts.findIndex((part) => !part.isToken())
  const initialState: DateState = {
    dateParts,
    typed: "",
    cursor: initialCursorPosition,
    value: opts.initial,
    error: Option.none()
  }
  return Custom(initialState, {
    render: handleDateRender(opts),
    process: handleDateProcess(opts),
    clear: handleDateClear(opts)
  })
}

/**
 * Creates a file-system selection prompt and returns the selected path.
 *
 * **Details**
 *
 * The prompt can be configured to select files, directories, or either path
 * type.
 *
 * You can also type to filter the listed entries. Every printable character is
 * appended to the filter query, so navigation is bound to the arrow keys,
 * `tab`, and the `Ctrl+P` / `Ctrl+N` chords used by `readline` and `fzf`
 * (`Ctrl+K` also moves up). `Ctrl+U` clears the query.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const File = (options: FileOptions = {}): Prompt<string> => {
  const opts: FileOptionsReq = {
    ...options,
    type: options.type ?? "file",
    message: options.message ?? `Choose a file`,
    startingPath: Option.fromUndefinedOr(options.startingPath),
    default: Option.fromUndefinedOr(options.default),
    maxPerPage: options.maxPerPage ?? 10,
    filter: options.filter ?? (() => Effect.succeed(true))
  }
  const initialState: Effect.Effect<
    FileState,
    never,
    Environment
  > = Effect.gen(function*() {
    const currentPath = yield* resolveCurrentPath(Option.none(), opts)
    const path = yield* Path.Path
    const defaultPath = Option.map(opts.default, (defaultValue) => path.resolve(currentPath, defaultValue))
    const initialPath = Option.match(defaultPath, {
      onNone: () => currentPath,
      onSome: (defaultPath) => path.dirname(defaultPath)
    })
    const files = yield* getFileList(initialPath, opts)
    const cursor = Option.match(defaultPath, {
      onNone: () => 0,
      onSome: (defaultPath) => {
        const index = files.indexOf(path.basename(defaultPath))
        return index === -1 ? 0 : index
      }
    })
    const confirm = FileConfirm.Hide()
    return { cursor, files, allFiles: files, query: "", path: Option.map(defaultPath, path.dirname), confirm }
  })
  return Custom(initialState, {
    render: handleFileRender(opts),
    process: handleFileProcess(opts),
    clear: handleFileClear(opts)
  })
}

/**
 * Composes prompts by using the output of this prompt to create the next prompt.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const flatMap: {
  <Output, Output2>(
    f: (output: Output) => Prompt<Output2>
  ): (self: Prompt<Output>) => Prompt<Output2>
  <Output, Output2>(
    self: Prompt<Output>,
    f: (output: Output) => Prompt<Output2>
  ): Prompt<Output2>
} = dual(2, <Output, Output2>(
  self: Prompt<Output>,
  f: (output: Output) => Prompt<Output2>
) => {
  const op = Object.create(proto)
  op._tag = "OnSuccess"
  op.prompt = self
  op.onSuccess = f
  return op
})

/**
 * Creates a floating-point number prompt.
 *
 * **Details**
 *
 * The prompt supports minimum and maximum bounds, keyboard step sizes, display
 * precision, and additional validation before submission.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const Number = (options: NumberOptions): Prompt<number> => {
  const opts: NumberOptionsReq = {
    default: 0,
    min: globalThis.Number.NEGATIVE_INFINITY,
    max: globalThis.Number.POSITIVE_INFINITY,
    incrementBy: 1,
    decrementBy: 1,
    precision: 2,
    validate: (n) => {
      if (n < opts.min) {
        return Effect.fail(`${n} must be greater than or equal to ${opts.min}`)
      }
      if (n > opts.max) {
        return Effect.fail(`${n} must be less than or equal to ${opts.max}`)
      }
      return Effect.succeed(n)
    },
    ...options
  }
  const initialValue = options.default === undefined ? "" : `${opts.default}`
  const initialState: NumberState = {
    cursor: initialValue.length,
    value: initialValue,
    error: Option.none()
  }
  return Custom(initialState, {
    render: handleRenderFloat(opts),
    process: handleProcessFloat(opts),
    clear: handleNumberClear(opts)
  })
}
/**
 * Creates a text prompt that does not echo typed input and returns the
 * submitted value wrapped in `Redacted`.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const Hidden = (
  options: TextOptions
): Prompt<Redacted.Redacted> => basePrompt(options, "hidden").pipe(map(Redacted.make))

/**
 * Creates an integer prompt.
 *
 * **Details**
 *
 * The prompt supports minimum and maximum bounds, keyboard step sizes, and
 * additional validation before submission.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const Int = (options: IntOptions): Prompt<number> => {
  const opts: IntOptionsReq = {
    default: 0,
    min: globalThis.Number.NEGATIVE_INFINITY,
    max: globalThis.Number.POSITIVE_INFINITY,
    incrementBy: 1,
    decrementBy: 1,
    validate: (n) => {
      if (n < opts.min) {
        return Effect.fail(`${n} must be greater than or equal to ${opts.min}`)
      }
      if (n > opts.max) {
        return Effect.fail(`${n} must be less than or equal to ${opts.max}`)
      }
      return Effect.succeed(n)
    },
    ...options
  }
  const initialValue = options.default === undefined ? "" : `${opts.default}`
  const initialState: NumberState = {
    cursor: initialValue.length,
    value: initialValue,
    error: Option.none()
  }
  return Custom(initialState, {
    render: handleRenderInteger(opts),
    process: handleProcessInteger(opts),
    clear: handleNumberClear(opts)
  })
}

/**
 * Creates a text prompt that returns an array of strings by splitting the
 * submitted input on the configured delimiter.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const List = (options: ListOptions): Prompt<Array<string>> =>
  String(options).pipe(
    map((output) => output.split(options.delimiter || ","))
  )

/**
 * Transforms the output value produced by a prompt.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const map: {
  <Output, Output2>(
    f: (output: Output) => Output2
  ): (self: Prompt<Output>) => Prompt<Output2>
  <Output, Output2>(
    self: Prompt<Output>,
    f: (output: Output) => Output2
  ): Prompt<Output2>
} = dual(2, <Output, Output2>(
  self: Prompt<Output>,
  f: (output: Output) => Output2
) => flatMap(self, (a) => succeed(f(a))))

/**
 * Creates a password prompt that masks typed input and returns the submitted
 * value wrapped in `Redacted`.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const Password = (
  options: TextOptions
): Prompt<Redacted.Redacted> => basePrompt(options, "password").pipe(map(Redacted.make))

/**
 * Runs a prompt by reading terminal input and rendering prompt frames until the
 * prompt submits a value.
 *
 * **Gotchas**
 *
 * The returned effect may fail with `Terminal.QuitError` if terminal input ends
 * or the prompt is quit.
 *
 * @stability unstable
 * @category running
 * @since 4.0.0
 */
export const run: <Output>(
  self: Prompt<Output>
) => Effect.Effect<
  Output,
  Terminal.QuitError,
  Environment
> = Effect.fnUntraced(
  function*<Output>(self: Prompt<Output>) {
    const terminal = yield* Terminal.Terminal
    const input = yield* terminal.readInput
    return yield* runWithInput(self, terminal, input)
  },
  Effect.mapError(() => new Terminal.QuitError({})),
  Effect.scoped
)

const getSelectInitialIndex = <A>(choices: ReadonlyArray<SelectChoice<A>>): number => {
  let initialIndex = 0
  let seenSelected = -1
  for (let i = 0; i < choices.length; i++) {
    const choice = choices[i] as SelectChoice<A>
    if (choice.selected === true) {
      if (seenSelected !== -1) {
        throw new Error("InvalidArgumentException: only a single choice can be selected by default for Prompt.Select")
      }
      seenSelected = i
    }
  }
  if (seenSelected !== -1) {
    initialIndex = seenSelected
  }
  return initialIndex
}

/**
 * Creates a prompt that lets the user select a single value from a list of
 * choices.
 *
 * **Gotchas**
 *
 * At most one choice may be marked as selected by default.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const Select = <const A>(options: SelectOptions<A>): Prompt<A> => {
  const opts: SelectOptionsReq<A> = {
    maxPerPage: 10,
    ...options
  }
  const initialIndex = getSelectInitialIndex(opts.choices)
  return Custom(initialIndex, {
    render: handleSelectRender(opts),
    process: handleSelectProcess(opts),
    clear: handleSelectClear(opts)
  })
}

/**
 * Creates a prompt that lets users filter select choices by typing.
 *
 * **Details**
 *
 * Every printable character is appended to the filter query, so navigation is
 * bound to the arrow keys, `tab`, and the `Ctrl+P` / `Ctrl+N` chords used by
 * `readline` and `fzf` (`Ctrl+K` also moves up). `Ctrl+U` clears the query.
 *
 * **Example** (Filtering choices with autocomplete)
 *
 * ```ts import.meta.vitest
 * import { Prompt } from "effect/cli"
 *
 * const language = Prompt.AutoComplete({
 *   message: "Choose a language",
 *   choices: [
 *     { title: "TypeScript", value: "ts" },
 *     { title: "Rust", value: "rs" },
 *     { title: "Kotlin", value: "kt" }
 *   ]
 * })
 *
 * Prompt.isPrompt(language) // => true
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const AutoComplete = <const A>(options: AutoCompleteOptions<A>): Prompt<A> => {
  const opts: AutoCompleteOptionsReq<A> = {
    maxPerPage: 10,
    filterLabel: "filter",
    filterPlaceholder: "type to filter",
    emptyMessage: "No matches",
    ...options
  }
  const initialIndex = getSelectInitialIndex(opts.choices)
  const filtered = filterAutoCompleteChoices(opts.choices, "")
  const index = filtered.length === 0
    ? 0
    : filtered.includes(initialIndex)
    ? initialIndex
    : filtered[0]
  const initialState: AutoCompleteState = {
    query: "",
    index,
    filtered
  }
  return Custom(initialState, {
    render: handleAutoCompleteRender(opts),
    process: handleAutoCompleteProcess(opts),
    clear: handleAutoCompleteClear(opts)
  })
}

/**
 * Creates a prompt that lets the user select multiple choices and returns their
 * values as an array.
 *
 * **Details**
 *
 * The prompt supports default selected choices, bulk-selection commands, and
 * minimum or maximum selection counts.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const MultiSelect = <const A>(
  options: SelectOptions<A> & MultiSelectOptions
): Prompt<Array<A>> => {
  const opts: SelectOptionsReq<A> & MultiSelectOptionsReq = {
    maxPerPage: 10,
    ...options
  }
  // Seed initial selection from choices marked as selected: true
  const initialSelected = new Set<number>()
  for (let i = 0; i < opts.choices.length; i++) {
    const choice = opts.choices[i] as SelectChoice<A>
    if (choice.selected === true && !choice.disabled) {
      initialSelected.add(i)
    }
  }
  const initialState: MultiSelectState = { index: 0, selectedIndices: initialSelected, error: Option.none() }
  return Custom(initialState, {
    render: handleMultiSelectRender(opts),
    process: handleMultiSelectProcess(opts),
    clear: handleMultiSelectClear(opts)
  })
}

/**
 * Creates a `Prompt` which immediately succeeds with the specified value.
 *
 * **Details**
 *
 * This prompt does not attempt to obtain user input or render anything to the
 * screen.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const succeed = <A>(value: A): Prompt<A> => {
  const op = Object.create(proto)
  op._tag = "Succeed"
  op.value = value
  return op
}

/**
 * Creates a text-entry prompt that echoes input and returns the submitted
 * string after validation.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const String = (
  options: TextOptions
): Prompt<string> => basePrompt(options, "text")

/**
 * Creates a toggle prompt that lets the user switch between active and inactive
 * states and returns the selected boolean value.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const Toggle = (options: ToggleOptions): Prompt<boolean> => {
  const opts: ToggleOptionsReq = {
    initial: false,
    active: "on",
    inactive: "off",
    ...options
  }
  return Custom(opts.initial, {
    render: handleToggleRender(opts),
    process: handleToggleProcess,
    clear: () => handleToggleClear(opts)
  })
}

const proto = {
  ...Effectable.Prototype<Prompt<any>>({
    label: "Prompt",
    evaluate() {
      return run(this)
    }
  }),
  [TypeId]: {
    _Output: (_: never) => _
  }
}

type Op<Tag extends string, Body = {}> = Prompt<never> & Body & {
  readonly _tag: Tag
}

type PromptPrimitive = Loop | OnSuccess | Succeed

interface Loop extends
  Op<"Loop", {
    readonly initialState: unknown | Effect.Effect<unknown, never, Environment>
    readonly render: Handlers<unknown, unknown>["render"]
    readonly process: (
      input: unknown,
      state: unknown
    ) => Effect.Effect<Action<unknown, unknown>, never, Environment>
    readonly clear: Handlers<unknown, unknown>["clear"]
    readonly events: Queue.Dequeue<unknown, never> | undefined
  }>
{}

/**
 * @internal
 */
export interface OnSuccess extends
  Op<"OnSuccess", {
    readonly prompt: PromptPrimitive
    readonly onSuccess: (value: unknown) => Prompt<unknown>
  }>
{}

interface Succeed extends
  Op<"Succeed", {
    readonly value: unknown
  }>
{}

const allTupled = <const T extends ArrayLike<Prompt<any>>>(arg: T): Prompt<
  {
    [K in keyof T]: [T[K]] extends [Prompt<infer A>] ? A : never
  }
> => {
  if (arg.length === 0) {
    return succeed([]) as any
  }
  if (arg.length === 1) {
    return map(arg[0], (x) => [x]) as any
  }
  let result = map(arg[0], (x) => [x])
  for (let i = 1; i < arg.length; i++) {
    const curr = arg[i]
    result = flatMap(result, (tuple) => map(curr, (a) => [...tuple, a]))
  }
  return result as any
}

const runWithInput = <Output>(
  prompt: Prompt<Output>,
  terminal: Terminal.Terminal,
  input: Queue.Dequeue<Terminal.UserInput, Cause.Done>
): Effect.Effect<Output, NoSuchElementError, Environment> =>
  Effect.suspend(() => {
    const op = prompt as PromptPrimitive
    switch (op._tag) {
      case "Loop": {
        return runLoop(op, terminal, input)
      }
      case "OnSuccess": {
        return Effect.flatMap(
          runWithInput(op.prompt, terminal, input),
          (a) => runWithInput(op.onSuccess(a), terminal, input)
        ) as any
      }
      case "Succeed": {
        return Effect.succeed(op.value)
      }
    }
  })

const runLoop = Effect.fnUntraced(
  function*(
    loop: Loop,
    terminal: Terminal.Terminal,
    input: Queue.Dequeue<Terminal.UserInput, Cause.Done>
  ) {
    let state = Effect.isEffect(loop.initialState) ? yield* loop.initialState : loop.initialState
    let action: Action<unknown, unknown> = Action.NextFrame({ state })
    let clear = ""
    while (true) {
      const msg = yield* loop.render(state, action)
      yield* Effect.orDie(terminal.display(clear + msg))
      clear = ""
      if (loop.events) {
        const takeInput = Queue.take(input).pipe(
          Effect.map((input) => ({ _tag: "Input" as const, input }))
        )
        const result = yield* Effect.raceFirst(
          takeInput,
          Queue.take(loop.events).pipe(Effect.map((value) => ({ _tag: "Event" as const, value })))
        )
        action = yield* loop.process(result, state)
      } else {
        const result = yield* Queue.take(input)
        action = yield* loop.process(result, state)
      }
      switch (action._tag) {
        case "Beep":
          continue
        case "NextFrame": {
          clear = yield* loop.clear(state, action)
          state = action.state
          continue
        }
        case "Submit": {
          clear = yield* loop.clear(state, action)
          const msg = yield* loop.render(state, action)
          yield* Effect.orDie(terminal.display(clear + msg))
          return action.value
        }
      }
    }
  },
  (effect, _, terminal) => Effect.ensuring(effect, Effect.orDie(terminal.display(Ansi.cursorShow)))
)

const Action = Data.taggedEnum<ActionDefinition>()

/**
 * Clears all lines taken up by the specified `text`.
 */
const eraseText = (text: string, columns: number): string => {
  if (columns === 0) {
    return Ansi.eraseLine + Ansi.cursorTo(0)
  }
  let rows = 0
  const lines = text.split(NEWLINE_REGEXP)
  for (const line of lines) {
    rows += 1 + Math.floor(Math.max(line.length - 1, 0) / columns)
  }
  return Ansi.eraseLines(rows)
}

const lines = (prompt: string, columns: number): number => {
  const lines = prompt.split(NEWLINE_REGEXP)
  return columns === 0
    ? lines.length
    : pipe(
      Arr.map(lines, (line) => Math.ceil(line.length / columns)),
      Arr.reduce(0, (left, right) => left + right)
    )
}

const clearOutputWithError = (outputText: string, columns: number, errorText?: string): string => {
  if (errorText !== undefined && errorText.length > 0) {
    return Ansi.cursorDown(lines(errorText, columns))
      + eraseText(`\n${errorText}`, columns)
      + eraseText(outputText, columns)
  }
  return eraseText(outputText, columns)
}

interface ConfirmOptionsReq extends OptionsReq<ConfirmOptions> {}

interface ConfirmState {
  readonly value: boolean
}

const renderBeep = Ansi.beep

const NEWLINE_REGEXP = /\r?\n/

const handleConfirmClear = (options: ConfirmOptionsReq) => {
  return Effect.fnUntraced(function*(state: ConfirmState, _: Action<ConfirmState, boolean>) {
    const terminal = yield* Terminal.Terminal
    const columns = yield* terminal.columns
    const figures = yield* getTheme(options)
    const confirmMessage = state.value
      ? options.placeholder.defaultConfirm!
      : options.placeholder.defaultDeny!
    const promptText = renderConfirmOutput(
      confirmMessage,
      figures.prefix,
      figures.pointerSmall,
      options,
      { plain: true }
    )
    const clearOutput = eraseText(promptText, columns)
    const resetCurrentLine = Ansi.eraseLine + Ansi.cursorLeft
    return clearOutput + resetCurrentLine
  })
}

const renderConfirmOutput = (
  confirm: string,
  leadingSymbol: string,
  trailingSymbol: string,
  options: ConfirmOptionsReq,
  renderOptions?: RenderOptions | undefined
) => renderPrompt(confirm, options.message, leadingSymbol, trailingSymbol, renderOptions)

const renderConfirmNextFrame = Effect.fnUntraced(function*(state: ConfirmState, options: ConfirmOptionsReq) {
  const figures = yield* getTheme(options)
  const leadingSymbol = annotateSymbol(figures.prefix, figures.primaryColor)
  const trailingSymbol = annotateSymbol(figures.pointerSmall, figures.mutedColor)
  // Marking these explicitly as present with `!` because they always will be
  // and there is really no value in adding a `DeepRequired` type helper just
  // for these internal cases
  const confirmMessage = state.value
    ? options.placeholder.defaultConfirm!
    : options.placeholder.defaultDeny!
  const confirm = Ansi.annotate(confirmMessage, figures.mutedColor)
  const promptMsg = renderConfirmOutput(confirm, leadingSymbol, trailingSymbol, options)
  return Ansi.cursorHide + promptMsg
})

const renderConfirmSubmission = Effect.fnUntraced(function*(value: boolean, options: ConfirmOptionsReq) {
  const figures = yield* getTheme(options)
  const leadingSymbol = annotateSymbol(figures.tick, figures.successColor)
  const trailingSymbol = annotateSymbol(figures.ellipsis, figures.mutedColor)
  const confirmMessage = value ? options.label.confirm : options.label.deny
  const promptMsg = renderConfirmOutput(confirmMessage, leadingSymbol, trailingSymbol, options)
  return promptMsg + "\n"
})

const handleConfirmRender = (options: ConfirmOptionsReq) => {
  return (_: ConfirmState, action: Action<ConfirmState, boolean>) => {
    return Action.$match(action, {
      Beep: () => Effect.succeed(renderBeep),
      NextFrame: ({ state }) => renderConfirmNextFrame(state, options),
      Submit: ({ value }) => renderConfirmSubmission(value, options)
    })
  }
}

const TRUE_VALUE_REGEXP = /^y|t$/
const FALSE_VALUE_REGEXP = /^n|f$/

const handleConfirmProcess = (input: Terminal.UserInput, defaultValue: boolean) => {
  const value = Option.getOrElse(input.input, () => "")
  if (input.key.name === "enter" || input.key.name === "return") {
    return Effect.succeed(Action.Submit({ value: defaultValue }))
  }
  if (TRUE_VALUE_REGEXP.test(value.toLowerCase())) {
    return Effect.succeed(Action.Submit({ value: true }))
  }
  if (FALSE_VALUE_REGEXP.test(value.toLowerCase())) {
    return Effect.succeed(Action.Submit({ value: false }))
  }
  return Effect.succeed(Action.Beep())
}

interface DateOptionsReq extends OptionsReq<DateOptions> {}

interface DateState {
  readonly typed: string
  readonly cursor: number
  readonly value: globalThis.Date
  readonly dateParts: ReadonlyArray<DatePart>
  readonly error: Option.Option<string>
}

const handleDateClear = (options: DateOptionsReq) => {
  return Effect.fnUntraced(function*(state: DateState, _: Action<DateState, globalThis.Date>) {
    const terminal = yield* Terminal.Terminal
    const columns = yield* terminal.columns
    const figures = yield* getTheme(options)
    const resetCurrentLine = Ansi.eraseLine + Ansi.cursorLeft
    const parts = Arr.reduce(state.dateParts, "", (doc, part) => doc + part.toString())
    const promptText = renderDateOutput(figures.prefix, figures.pointerSmall, parts, options, { plain: true })
    const errorText = Option.isSome(state.error)
      ? Arr.match(state.error.value.split(NEWLINE_REGEXP), {
        onEmpty: () => "",
        onNonEmpty: (errorLines) => separateSymbol(figures.pointerSmall, errorLines.join("\n"))
      })
      : ""
    const clearOutput = clearOutputWithError(promptText, columns, errorText)
    return clearOutput + resetCurrentLine
  })
}

const renderDateError = (state: DateState, pointer: string, theme: Theme): string => {
  if (Option.isSome(state.error)) {
    const errorLines = state.error.value.split(NEWLINE_REGEXP)
    if (Arr.isReadonlyArrayNonEmpty(errorLines)) {
      const prefix = annotateSymbol(pointer, theme.errorColor)
      const lines = Arr.map(errorLines, (str) => annotateErrorLine(str, theme.errorColor))
      return Ansi.cursorSavePosition + "\n" + separateSymbol(prefix, lines.join("\n")) + Ansi.cursorRestorePosition
    }
  }
  return ""
}

const renderParts = (state: DateState, theme: Theme, submitted: boolean = false) => {
  return Arr.reduce(
    state.dateParts,
    "",
    (doc, part, currentIndex) => {
      const partDoc = part.toString()
      if (currentIndex === state.cursor && !submitted) {
        const annotation = Ansi.combine(Ansi.underlined, theme.primaryColor)
        return doc + Ansi.annotate(partDoc, annotation)
      }
      return doc + partDoc
    }
  )
}

const renderDateOutput = (
  leadingSymbol: string,
  trailingSymbol: string,
  parts: string,
  options: DateOptionsReq,
  renderOptions?: RenderOptions | undefined
) => renderPrompt(parts, options.message, leadingSymbol, trailingSymbol, renderOptions)

const renderDateNextFrame = Effect.fnUntraced(function*(state: DateState, options: DateOptionsReq) {
  const figures = yield* getTheme(options)
  const leadingSymbol = annotateSymbol(figures.prefix, figures.primaryColor)
  const trailingSymbol = annotateSymbol(figures.pointerSmall, figures.mutedColor)
  const parts = renderParts(state, figures)
  const promptMsg = renderDateOutput(leadingSymbol, trailingSymbol, parts, options)
  const errorMsg = renderDateError(state, figures.pointerSmall, figures)
  return Ansi.cursorHide + promptMsg + errorMsg
})

const renderDateSubmission = Effect.fnUntraced(function*(state: DateState, options: DateOptionsReq) {
  const figures = yield* getTheme(options)
  const leadingSymbol = annotateSymbol(figures.tick, figures.successColor)
  const trailingSymbol = annotateSymbol(figures.ellipsis, figures.mutedColor)
  const parts = renderParts(state, figures, true)
  const promptMsg = renderDateOutput(leadingSymbol, trailingSymbol, parts, options)
  return promptMsg + "\n"
})

const processUp = (state: DateState) => {
  state.dateParts[state.cursor].increment()
  return Action.NextFrame({
    state: { ...state, typed: "" }
  })
}

const processDown = (state: DateState) => {
  state.dateParts[state.cursor].decrement()
  return Action.NextFrame({
    state: { ...state, typed: "" }
  })
}

const processDateCursorLeft = (state: DateState) => {
  const previous = state.dateParts[state.cursor].previousPart()
  if (Option.isSome(previous)) {
    return Action.NextFrame({
      state: {
        ...state,
        typed: "",
        cursor: state.dateParts.indexOf(previous.value)
      }
    })
  }
  return Action.Beep()
}

const processDateCursorRight = (state: DateState) => {
  const next = state.dateParts[state.cursor].nextPart()
  if (Option.isSome(next)) {
    return Action.NextFrame({
      state: {
        ...state,
        typed: "",
        cursor: state.dateParts.indexOf(next.value)
      }
    })
  }
  return Action.Beep()
}

const processDateNext = (state: DateState) => {
  const next = state.dateParts[state.cursor].nextPart()
  const cursor = Option.match(next, {
    onNone: () => state.dateParts.findIndex((part) => !part.isToken()),
    onSome: (next) => state.dateParts.indexOf(next)
  })
  return Action.NextFrame({
    state: { ...state, typed: "", cursor }
  })
}

const defaultDateProcessor = (value: string, state: DateState) => {
  if (/\d/.test(value)) {
    const typed = state.typed + value
    state.dateParts[state.cursor].setValue(typed)
    return Action.NextFrame({
      state: { ...state, typed }
    })
  }
  return Action.Beep()
}

const defaultLocales: DateOptionsReq["locales"] = {
  months: [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ],
  monthsShort: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  weekdays: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  weekdaysShort: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
}

const handleDateRender = (options: DateOptionsReq) => {
  return (state: DateState, action: Action<DateState, globalThis.Date>) => {
    return Action.$match(action, {
      Beep: () => Effect.succeed(renderBeep),
      NextFrame: ({ state }) => renderDateNextFrame(state, options),
      Submit: () => renderDateSubmission(state, options)
    })
  }
}

const handleDateProcess = (options: DateOptionsReq) => {
  return (input: Terminal.UserInput, state: DateState) => {
    switch (input.key.name) {
      case "left": {
        return Effect.succeed(processDateCursorLeft(state))
      }
      case "right": {
        return Effect.succeed(processDateCursorRight(state))
      }
      case "k":
      case "up": {
        return Effect.succeed(processUp(state))
      }
      case "j":
      case "down": {
        return Effect.succeed(processDown(state))
      }
      case "tab": {
        return Effect.succeed(processDateNext(state))
      }
      case "enter":
      case "return": {
        return Effect.match(options.validate(state.value), {
          onFailure: (error) =>
            Action.NextFrame({
              state: {
                ...state,
                error: Option.some(error)
              }
            }),
          onSuccess: (value) => Action.Submit({ value })
        })
      }
      default: {
        return Effect.succeed(defaultDateProcessor(Option.getOrElse(input.input, () => ""), state))
      }
    }
  }
}

const DATE_PART_REGEXP =
  /\\(.)|"((?:\\["\\]|[^"])+)"|(D[Do]?|d{3,4}|d)|(M{1,4})|(YY(?:YY)?)|([aA])|([Hh]{1,2})|(m{1,2})|(s{1,2})|(S{1,4})|./g

const regExpGroups: Record<number, (params: DatePartParams) => DatePart> = {
  1: ({ token, ...opts }) => new Token({ token: token.replace(/\\(.)/g, "$1"), ...opts }),
  2: (opts) => new Day(opts),
  3: (opts) => new Month(opts),
  4: (opts) => new Year(opts),
  5: (opts) => new Meridiem(opts),
  6: (opts) => new Hours(opts),
  7: (opts) => new Minutes(opts),
  8: (opts) => new Seconds(opts),
  9: (opts) => new Milliseconds(opts)
}

const makeDateParts = (
  dateMask: string,
  date: globalThis.Date,
  locales: DateOptions["locales"]
) => {
  const parts: Array<DatePart> = []
  let result: RegExpExecArray | null = null
  // oxlint-disable-next-line no-cond-assign
  while (result = DATE_PART_REGEXP.exec(dateMask)) {
    const match = result.shift()
    const index = result.findIndex((group) => group !== undefined)
    if (index in regExpGroups) {
      const token = (result[index] || match)!
      parts.push(regExpGroups[index]({ token, date, parts, locales }))
    } else {
      parts.push(new Token({ token: (result[index] || match)!, date, parts, locales }))
    }
  }
  const orderedParts = parts.reduce((array, element) => {
    const lastElement = array[array.length - 1]
    if (element.isToken() && lastElement !== undefined && lastElement.isToken()) {
      lastElement.setValue(element.token)
    } else {
      array.push(element)
    }
    return array
  }, Arr.empty<DatePart>())
  parts.splice(0, parts.length, ...orderedParts)
  return parts
}

interface DatePartParams {
  readonly token: string
  readonly locales: DateOptions["locales"]
  readonly date?: globalThis.Date
  readonly parts?: ReadonlyArray<DatePart>
}

abstract class DatePart {
  token: string
  readonly date: globalThis.Date
  readonly parts: ReadonlyArray<DatePart>
  readonly locales: DateOptions["locales"]

  constructor(params: DatePartParams) {
    this.token = params.token
    this.locales = params.locales
    this.date = params.date || new globalThis.Date()
    this.parts = params.parts || [this]
  }

  /**
   * Increments this date part.
   */
  abstract increment(): void

  /**
   * Decrements this date part.
   */
  abstract decrement(): void

  /**
   * Sets the current value of this date part to the provided value.
   */
  abstract setValue(value: string): void

  /**
   * Returns `true` if this `DatePart` is a `Token`, `false` otherwise.
   */
  isToken(): this is Token {
    return false
  }

  /**
   * Retrieves the next date part in the list of parts.
   */
  nextPart(): Option.Option<DatePart> {
    const currentPartIndex = Option.getOrElse(Arr.findFirstIndex(this.parts, (part) => part === this), () => 0)
    return Arr.findFirst(this.parts.slice(currentPartIndex + 1), (part) => !part.isToken())
  }

  /**
   * Retrieves the previous date part in the list of parts.
   */
  previousPart(): Option.Option<DatePart> {
    const currentPartIndex = Arr.findFirstIndex(this.parts, (part) => part === this)
    if (Option.isSome(currentPartIndex)) {
      return Arr.findLast(this.parts.slice(0, currentPartIndex.value), (part) => !part.isToken())
    }
    return Option.none()
  }

  toString() {
    return globalThis.String(this.date)
  }
}

class Token extends DatePart {
  increment(): void {}

  decrement(): void {}

  setValue(value: string): void {
    this.token = this.token + value
  }

  override isToken(): this is Token {
    return true
  }

  override toString() {
    return this.token
  }
}

class Milliseconds extends DatePart {
  increment(): void {
    this.date.setMilliseconds(this.date.getMilliseconds() + 1)
  }

  decrement(): void {
    this.date.setMilliseconds(this.date.getMilliseconds() - 1)
  }

  setValue(value: string): void {
    this.date.setMilliseconds(globalThis.Number.parseInt(value.slice(-this.token.length)))
  }

  override toString() {
    const millis = `${this.date.getMilliseconds()}`
    return millis.padStart(4, "0").substring(0, this.token.length)
  }
}

class Seconds extends DatePart {
  increment(): void {
    this.date.setSeconds(this.date.getSeconds() + 1)
  }

  decrement(): void {
    this.date.setSeconds(this.date.getSeconds() - 1)
  }

  setValue(value: string): void {
    this.date.setSeconds(globalThis.Number.parseInt(value.slice(-2)))
  }

  override toString() {
    const seconds = `${this.date.getSeconds()}`
    return this.token.length > 1
      ? seconds.padStart(2, "0")
      : seconds
  }
}

class Minutes extends DatePart {
  increment(): void {
    this.date.setMinutes(this.date.getMinutes() + 1)
  }

  decrement(): void {
    this.date.setMinutes(this.date.getMinutes() - 1)
  }

  setValue(value: string): void {
    this.date.setMinutes(globalThis.Number.parseInt(value.slice(-2)))
  }

  override toString() {
    const minutes = `${this.date.getMinutes()}`
    return this.token.length > 1
      ? minutes.padStart(2, "0") :
      minutes
  }
}

class Hours extends DatePart {
  increment(): void {
    this.date.setHours(this.date.getHours() + 1)
  }

  decrement(): void {
    this.date.setHours(this.date.getHours() - 1)
  }

  setValue(value: string): void {
    this.date.setHours(globalThis.Number.parseInt(value.slice(-2)))
  }

  override toString() {
    const hours = /h/.test(this.token)
      ? this.date.getHours() % 12 || 12
      : this.date.getHours()
    return this.token.length > 1
      ? `${hours}`.padStart(2, "0")
      : `${hours}`
  }
}

class Day extends DatePart {
  increment(): void {
    this.date.setDate(this.date.getDate() + 1)
  }

  decrement(): void {
    this.date.setDate(this.date.getDate() - 1)
  }

  setValue(value: string): void {
    this.date.setDate(globalThis.Number.parseInt(value.slice(-2)))
  }

  override toString() {
    const date = this.date.getDate()
    const day = this.date.getDay()
    switch (this.token) {
      case "DD":
        return `${date}`.padStart(2, "0")
      case "Do":
        return `${date}${this.ordinalIndicator(date)}`
      case "d":
        return `${day + 1}`
      case "ddd":
        return this.locales!.weekdaysShort[day]!
      case "dddd":
        return this.locales!.weekdays[day]!
      default:
        return `${date}`
    }
  }

  private ordinalIndicator(day: number): string {
    if (day >= 11 && day <= 13) {
      return "th"
    }
    switch (day % 10) {
      case 1:
        return "st"
      case 2:
        return "nd"
      case 3:
        return "rd"
      default:
        return "th"
    }
  }
}

class Month extends DatePart {
  increment(): void {
    this.date.setMonth(this.date.getMonth() + 1)
  }

  decrement(): void {
    this.date.setMonth(this.date.getMonth() - 1)
  }

  setValue(value: string): void {
    const month = globalThis.Number.parseInt(value.slice(-2)) - 1
    this.date.setMonth(month < 0 ? 0 : month)
  }

  override toString() {
    const month = this.date.getMonth()
    switch (this.token.length) {
      case 2:
        return `${month + 1}`.padStart(2, "0")
      case 3:
        return this.locales!.monthsShort[month]!
      case 4:
        return this.locales!.months[month]!
      default:
        return `${month + 1}`
    }
  }
}

class Year extends DatePart {
  increment(): void {
    this.date.setFullYear(this.date.getFullYear() + 1)
  }

  decrement(): void {
    this.date.setFullYear(this.date.getFullYear() - 1)
  }

  setValue(value: string): void {
    this.date.setFullYear(globalThis.Number.parseInt(value.slice(-4)))
  }

  override toString() {
    const year = `${this.date.getFullYear()}`.padStart(4, "0")
    return this.token.length === 2
      ? year.slice(-2)
      : year
  }
}

class Meridiem extends DatePart {
  increment(): void {
    this.date.setHours((this.date.getHours() + 12) % 24)
  }

  decrement(): void {
    this.increment()
  }

  setValue(_value: string): void {}

  override toString() {
    const meridiem = this.date.getHours() >= 12 ? "pm" : "am"
    return /A/.test(this.token)
      ? meridiem.toUpperCase()
      : meridiem
  }
}

interface FileOptionsReq extends OptionsReq<Omit<FileOptions, "startingPath" | "default">> {
  readonly startingPath: Option.Option<string>
  readonly default: Option.Option<string>
}

interface FileState {
  readonly cursor: number
  readonly files: ReadonlyArray<string>
  readonly allFiles: ReadonlyArray<string>
  readonly query: string
  readonly path: Option.Option<string>
  readonly confirm: FileConfirm
}

const CONFIRM_MESSAGE = "The selected directory contains files. Would you like to traverse the selected directory?"
const FILE_FILTER_LABEL = "filter"
const FILE_FILTER_PLACEHOLDER = "type to filter"
const FILE_EMPTY_MESSAGE = "No matches"
type FileConfirm = Data.TaggedEnum<{
  readonly Show: {}
  readonly Hide: {}
}>
const FileConfirm = Data.taggedEnum<FileConfirm>()

const showConfirmation = FileConfirm.$is("Show")

const resolveCurrentPath = (
  path: Option.Option<string>,
  options: FileOptionsReq
): Effect.Effect<string, never, FileSystem.FileSystem> => {
  if (Option.isSome(path)) {
    return Effect.succeed(path.value)
  }
  if (Option.isSome(options.startingPath)) {
    const startingPath = options.startingPath.value
    return Effect.flatMap(FileSystem.FileSystem, (fs) =>
      // Ensure the user provided starting path exists
      Effect.orDie(fs.exists(startingPath)).pipe(
        Effect.flatMap((exists) =>
          exists ? Effect.void : Effect.die(
            `The provided starting path '${startingPath}' does not exist`
          )
        ),
        Effect.as(startingPath)
      ))
  }
  return Effect.sync(() => process.cwd())
}

const getFileList = Effect.fnUntraced(function*(directory: string, options: FileOptionsReq) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const files = yield* Effect.orDie(fs.readDirectory(directory)).pipe(
    // Always prepend the `".."` option to the file list but allow it
    // to be filtered out if the user so desires
    Effect.map((files) => ["..", ...files])
  )
  return yield* Effect.filter(files, (file) => {
    const result = options.filter(file)
    const userDefinedFilter = Effect.isEffect(result)
      ? result
      : Effect.succeed(result)
    const directoryFilter = options.type === "directory"
      ? Effect.map(
        Effect.orDie(fs.stat(path.join(directory, file))),
        (info) => info.type === "Directory"
      )
      : Effect.succeed(true)
    return Effect.zipWith(userDefinedFilter, directoryFilter, (a, b) => a && b)
  }, { concurrency: files.length })
})

const filterFiles = (files: ReadonlyArray<string>, query: string) => {
  if (query.length === 0) {
    return files
  }
  const normalizedQuery = query.toLowerCase()
  const filtered: Array<string> = []
  for (let index = 0; index < files.length; index++) {
    if (files[index].toLowerCase().includes(normalizedQuery)) {
      filtered.push(files[index])
    }
  }
  return filtered
}

const updateFileState = (
  state: FileState,
  query: string,
  allFiles: ReadonlyArray<string> = state.allFiles
): FileState => {
  const files = filterFiles(allFiles, query)
  if (files.length === 0) {
    return { ...state, query, allFiles, files, cursor: 0 }
  }
  const selected = state.files[state.cursor]
  const cursor = selected === undefined ? 0 : files.indexOf(selected)
  return {
    ...state,
    query,
    allFiles,
    files,
    cursor: cursor === -1 ? 0 : cursor
  }
}

const handleFileClear = (options: FileOptionsReq) => {
  return Effect.fnUntraced(function*(state: FileState, _: Action<FileState, string>) {
    const terminal = yield* Terminal.Terminal
    const columns = yield* terminal.columns
    const path = yield* Path.Path
    const figures = yield* getTheme(options)
    const currentPath = yield* resolveCurrentPath(state.path, options)
    const selectedPath = state.files[state.cursor]
    const resolvedPath = selectedPath === undefined ? currentPath : path.resolve(currentPath, selectedPath)
    const resolvedPathText = separateSymbol(figures.pointerSmall, resolvedPath)
    const isConfirming = showConfirmation(state.confirm)
    const promptText = isConfirming
      ? renderPrompt("(Y/n)", CONFIRM_MESSAGE, figures.prefix, figures.pointerSmall, { plain: true })
      : renderPrompt(
        renderFileFilter(state, figures, { plain: true }),
        options.message,
        figures.tick,
        figures.ellipsis,
        {
          plain: true
        }
      )
    const filesText = isConfirming
      ? ""
      : renderFiles(state, state.files, figures, options, { plain: true })
    const outputText = isConfirming
      ? `${promptText}\n${resolvedPathText}`
      : `${promptText}\n${resolvedPathText}\n${filesText}`
    const clearOutput = eraseText(outputText, columns)
    const resetCurrentLine = Ansi.eraseLine + Ansi.cursorLeft
    return clearOutput + resetCurrentLine
  })
}

type RenderOptions = {
  readonly plain?: boolean
}

const renderPrompt = (
  confirm: string,
  message: string,
  leadingSymbol: string,
  trailingSymbol: string,
  options?: RenderOptions | undefined
) => {
  const prefix = leadingSymbol.length === 0 ? "" : leadingSymbol + " "
  const renderLine = (line: string) => {
    let output = prefix + line
    if (trailingSymbol.length > 0) {
      output += " " + trailingSymbol
    }
    if (confirm.length > 0) {
      output += " " + confirm
    } else if (trailingSymbol.length > 0) {
      output += " "
    }
    return output
  }
  const annotate = options?.plain === true
    ? (line: string) => line
    : annotateLine
  return Arr.match(message.split(NEWLINE_REGEXP), {
    onEmpty: () => renderLine(""),
    onNonEmpty: (promptLines) => {
      const lines = Arr.map(promptLines, (line) => annotate(line))
      return renderLine(lines.join("\n"))
    }
  })
}

const renderPrefix = (
  state: FileState,
  toDisplay: { readonly startIndex: number; readonly endIndex: number },
  currentIndex: number,
  length: number,
  figures: Theme,
  renderOptions?: RenderOptions | undefined
) => {
  const prefix = renderPagingPrefix(
    figures,
    currentIndex === toDisplay.startIndex && toDisplay.startIndex > 0,
    currentIndex === toDisplay.endIndex - 1 && toDisplay.endIndex < length
  )
  if (state.cursor === currentIndex) {
    return renderOptions?.plain === true
      ? figures.pointer + prefix
      : annotateSymbol(figures.pointer, figures.primaryColor) + prefix
  }
  return prefix + " ".repeat(figures.pointer.length)
}

const renderFileName = (
  file: string,
  isSelected: boolean,
  theme: Theme,
  renderOptions?: RenderOptions | undefined
) => {
  if (renderOptions?.plain === true) {
    return file
  }
  return isSelected
    ? Ansi.annotate(file, Ansi.combine(Ansi.underlined, theme.primaryColor))
    : file
}

const renderFileFilter = (state: FileState, theme: Theme, renderOptions?: RenderOptions | undefined) => {
  const filterValue = state.query.length === 0
    ? renderOptions?.plain === true
      ? FILE_FILTER_PLACEHOLDER
      : Ansi.annotate(FILE_FILTER_PLACEHOLDER, theme.mutedColor)
    : renderOptions?.plain === true
    ? state.query
    : Ansi.annotate(state.query, Ansi.combine(Ansi.underlined, theme.primaryColor))
  return `[${FILE_FILTER_LABEL}: ${filterValue}]`
}

const renderFiles = (
  state: FileState,
  files: ReadonlyArray<string>,
  figures: Theme,
  options: FileOptionsReq,
  renderOptions?: RenderOptions | undefined
) => {
  const length = files.length
  if (length === 0) {
    return renderOptions?.plain === true
      ? FILE_EMPTY_MESSAGE
      : Ansi.annotate(FILE_EMPTY_MESSAGE, figures.mutedColor)
  }
  const toDisplay = entriesToDisplay(state.cursor, length, options.maxPerPage)
  const documents: Array<string> = []
  for (let index = toDisplay.startIndex; index < toDisplay.endIndex; index++) {
    const isSelected = state.cursor === index
    const prefix = renderPrefix(state, toDisplay, index, length, figures, renderOptions)
    const fileName = renderFileName(files[index], isSelected, figures, renderOptions)
    documents.push(prefix + fileName)
  }
  return documents.join("\n")
}

const renderFileNextFrame = Effect.fnUntraced(function*(state: FileState, options: FileOptionsReq) {
  const path = yield* Path.Path
  const figures = yield* getTheme(options)
  const currentPath = yield* resolveCurrentPath(state.path, options)
  const selectedPath = state.files[state.cursor]
  const resolvedPath = selectedPath === undefined ? currentPath : path.resolve(currentPath, selectedPath)
  const resolvedPathMsg = Ansi.annotate(separateSymbol(figures.pointerSmall, resolvedPath), figures.mutedColor)

  if (showConfirmation(state.confirm)) {
    const leadingSymbol = annotateSymbol(figures.prefix, figures.primaryColor)
    const trailingSymbol = annotateSymbol(figures.pointerSmall, figures.mutedColor)
    const confirm = Ansi.annotate("(Y/n)", figures.mutedColor)
    const promptMsg = renderPrompt(confirm, CONFIRM_MESSAGE, leadingSymbol, trailingSymbol)
    return Ansi.cursorHide + promptMsg + "\n" + resolvedPathMsg
  }
  const leadingSymbol = annotateSymbol(figures.tick, figures.successColor)
  const trailingSymbol = annotateSymbol(figures.ellipsis, figures.mutedColor)
  const promptMsg = renderPrompt(renderFileFilter(state, figures), options.message, leadingSymbol, trailingSymbol)
  const files = renderFiles(state, state.files, figures, options)
  return Ansi.cursorHide + promptMsg + "\n" + resolvedPathMsg + "\n" + files
})

const renderFileSubmission = Effect.fnUntraced(function*(state: FileState, value: string, options: FileOptionsReq) {
  const figures = yield* getTheme(options)
  const leadingSymbol = annotateSymbol(figures.tick, figures.successColor)
  const trailingSymbol = annotateSymbol(figures.ellipsis, figures.mutedColor)
  const promptMsg = renderPrompt(renderFileFilter(state, figures), options.message, leadingSymbol, trailingSymbol)
  return promptMsg + " " + Ansi.annotate(value, figures.submittedColor) + "\n"
})

const handleFileRender = (options: FileOptionsReq) => {
  return (
    state: FileState,
    action: Action<FileState, string>
  ): Effect.Effect<string, never, Path.Path | FileSystem.FileSystem> => {
    return Action.$match(action, {
      Beep: () => Effect.succeed(renderBeep),
      NextFrame: ({ state }) => renderFileNextFrame(state, options),
      Submit: ({ value }) => renderFileSubmission(state, value, options)
    })
  }
}

const processFileCursorUp = (state: FileState) => {
  if (state.files.length === 0) {
    return Effect.succeed(Action.Beep())
  }
  const cursor = state.cursor - 1
  return Effect.succeed(Action.NextFrame({
    state: { ...state, cursor: cursor < 0 ? state.files.length - 1 : cursor }
  }))
}

const processFileCursorDown = (state: FileState) => {
  if (state.files.length === 0) {
    return Effect.succeed(Action.Beep())
  }
  return Effect.succeed(Action.NextFrame({
    state: { ...state, cursor: (state.cursor + 1) % state.files.length }
  }))
}

const processFileBackspace = (state: FileState) => {
  if (state.query.length === 0) {
    return Effect.succeed(Action.Beep())
  }
  const query = state.query.slice(0, state.query.length - 1)
  return Effect.succeed(Action.NextFrame({ state: updateFileState(state, query) }))
}

const processFileClear = (state: FileState) => Effect.succeed(Action.NextFrame({ state: updateFileState(state, "") }))

const processFileInput = (input: string, state: FileState) => {
  if (input.length === 0) {
    return Effect.succeed(Action.Beep())
  }
  const query = state.query + input
  return Effect.succeed(Action.NextFrame({ state: updateFileState(state, query) }))
}

const processSelection = Effect.fnUntraced(function*(state: FileState, options: FileOptionsReq) {
  if (state.files.length === 0) {
    return Action.Beep()
  }
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const currentPath = yield* resolveCurrentPath(state.path, options)
  const selectedPath = state.files[state.cursor]
  const resolvedPath = path.resolve(currentPath, selectedPath)
  const info = yield* Effect.orDie(fs.stat(resolvedPath))
  if (info.type === "Directory") {
    const files = yield* getFileList(resolvedPath, options)
    const filesWithoutParent = files.filter((file) => file !== "..")
    // If the user selected a directory AND the prompt type can result with
    // a directory, we must confirm:
    //  - If the selected directory has any files
    //  - Confirm whether or not the user wants to traverse those files
    if (options.type === "directory" || options.type === "either") {
      return filesWithoutParent.length === 0
        // Directory is empty so it's safe to select it
        ? Action.Submit({ value: resolvedPath })
        // Directory has contents - show confirmation to user
        : Action.NextFrame({
          state: { ...state, confirm: FileConfirm.Show() }
        })
    }
    return Action.NextFrame({
      state: {
        cursor: 0,
        files,
        allFiles: files,
        query: "",
        path: Option.some(resolvedPath),
        confirm: FileConfirm.Hide()
      }
    })
  }
  return Action.Submit({ value: resolvedPath })
})

const handleFileProcess = (options: FileOptionsReq) => {
  return Effect.fnUntraced(function*(input: Terminal.UserInput, state: FileState) {
    // Navigation is bound to ctrl chords rather than bare `j`/`k`, so that every
    // printable character reaches the filter input.
    if (input.key.ctrl) {
      switch (input.key.name) {
        case "u": {
          if (showConfirmation(state.confirm)) {
            return Action.Beep()
          }
          return yield* processFileClear(state)
        }
        case "p":
        case "k": {
          return yield* processFileCursorUp(state)
        }
        case "n": {
          return yield* processFileCursorDown(state)
        }
        default: {
          return Action.Beep()
        }
      }
    }
    switch (input.key.name) {
      case "up": {
        return yield* processFileCursorUp(state)
      }
      case "down":
      case "tab": {
        return yield* processFileCursorDown(state)
      }
      case "backspace": {
        if (showConfirmation(state.confirm)) {
          return Action.Beep()
        }
        return yield* processFileBackspace(state)
      }
      case "enter":
      case "return": {
        return yield* processSelection(state, options)
      }
      case "y":
      case "t": {
        if (showConfirmation(state.confirm)) {
          const path = yield* Path.Path
          const currentPath = yield* resolveCurrentPath(state.path, options)
          const selectedPath = state.files[state.cursor]
          const resolvedPath = path.resolve(currentPath, selectedPath)
          const files = yield* getFileList(resolvedPath, options)
          return Action.NextFrame({
            state: {
              cursor: 0,
              files,
              allFiles: files,
              query: "",
              path: Option.some(resolvedPath),
              confirm: FileConfirm.Hide()
            }
          })
        }
        return yield* processFileInput(Option.getOrElse(input.input, () => ""), state)
      }
      case "n":
      case "f": {
        if (showConfirmation(state.confirm)) {
          const path = yield* Path.Path
          const currentPath = yield* resolveCurrentPath(state.path, options)
          const selectedPath = state.files[state.cursor]
          const resolvedPath = path.resolve(currentPath, selectedPath)
          return Action.Submit({ value: resolvedPath })
        }
        return yield* processFileInput(Option.getOrElse(input.input, () => ""), state)
      }
      default: {
        if (showConfirmation(state.confirm)) {
          return Action.Beep()
        }
        return yield* processFileInput(Option.getOrElse(input.input, () => ""), state)
      }
    }
  })
}

interface SelectOptionsReq<A> extends SelectOptions<A> {
  readonly maxPerPage: number
}
interface MultiSelectOptionsReq extends MultiSelectOptions {}

type MultiSelectState = {
  index: number
  selectedIndices: Set<number>
  error: Option.Option<string>
}

const renderMultiSelectError = (
  state: MultiSelectState,
  pointer: string,
  theme: Theme,
  renderOptions?: RenderOptions | undefined
): string => {
  if (Option.isSome(state.error)) {
    return Arr.match(state.error.value.split(NEWLINE_REGEXP), {
      onEmpty: () => "",
      onNonEmpty: (errorLines) => {
        if (renderOptions?.plain === true) {
          return separateSymbol(pointer, errorLines.join("\n"))
        }
        const prefix = annotateSymbol(pointer, theme.errorColor)
        const lines = Arr.map(errorLines, (str) => annotateErrorLine(str, theme.errorColor))
        return Ansi.cursorSavePosition + "\n" + separateSymbol(prefix, lines.join("\n")) + Ansi.cursorRestorePosition
      }
    })
  }
  return ""
}

const renderChoiceDescription = <A>(
  choice: SelectChoice<A>,
  isActive: boolean,
  theme: Theme,
  renderOptions?: RenderOptions | undefined
) => {
  if (!choice.disabled && choice.description && isActive) {
    const text = theme.descriptionSeparator + choice.description
    return renderOptions?.plain === true
      ? text
      : Ansi.annotate(text, theme.mutedColor)
  }
  return ""
}

const metaOptionsCount = 2

const renderMultiSelectTitle = (
  title: string,
  isHighlighted: boolean,
  theme: Theme,
  renderOptions?: RenderOptions | undefined
) => {
  if (renderOptions?.plain === true || !isHighlighted) {
    return title
  }
  return Ansi.annotate(title, Ansi.combine(Ansi.underlined, theme.primaryColor))
}

const renderMultiSelectChoices = <A>(
  state: MultiSelectState,
  options: SelectOptionsReq<A> & MultiSelectOptionsReq,
  figures: Theme,
  renderOptions?: RenderOptions | undefined
) => {
  const choices = options.choices
  const checkboxWidth = Math.max(figures.checkboxOn.length, figures.checkboxOff.length)
  const selectableCount = choices.filter((choice) => !choice.disabled).length
  const selectedCount = Array.from(state.selectedIndices).filter((index) => !choices[index].disabled).length
  const allSelected = selectedCount === selectableCount

  const selectAllText = allSelected
    ? options?.selectNone ?? "Select None"
    : options?.selectAll ?? "Select All"

  const inverseSelectionText = options?.inverseSelection ?? "Inverse Selection"

  const metaOptions = [
    { title: selectAllText },
    { title: inverseSelectionText }
  ]
  const allChoices = [...metaOptions, ...choices]
  const toDisplay = entriesToDisplay(state.index, allChoices.length, options.maxPerPage)
  const documents: Array<string> = []
  for (let index = toDisplay.startIndex; index < toDisplay.endIndex; index++) {
    const choice = allChoices[index]
    const isHighlighted = state.index === index
    const prefix = renderPagingPrefix(
      figures,
      index === toDisplay.startIndex && toDisplay.startIndex > 0,
      index === toDisplay.endIndex - 1 && toDisplay.endIndex < allChoices.length
    )
    if (index < metaOptions.length) {
      // Meta options
      const title = renderMultiSelectTitle(choice.title, isHighlighted, figures, renderOptions)
      documents.push(prefix + (prefix.length === 0 ? "" : " ") + title)
    } else {
      // Regular choices
      const choiceIndex = index - metaOptions.length
      const isSelected = state.selectedIndices.has(choiceIndex)
      const checkbox = isSelected ? figures.checkboxOn : figures.checkboxOff
      const annotatedCheckbox = isHighlighted && renderOptions?.plain !== true
        ? Ansi.annotate(checkbox, figures.primaryColor)
        : checkbox
      const selectChoice = choice as SelectChoice<A>
      const title = renderChoiceTitle(selectChoice, isHighlighted, figures, renderOptions)
      const description = renderChoiceDescription(selectChoice, isHighlighted, figures, renderOptions)
      const checkboxPrefix = checkboxWidth === 0
        ? ""
        : annotatedCheckbox + " ".repeat(checkboxWidth - checkbox.length + 1)
      documents.push(
        prefix + (prefix.length === 0 ? "" : " ") + checkboxPrefix + title + " " + description
      )
    }
  }
  return documents.join("\n")
}

const renderMultiSelectNextFrame = Effect.fnUntraced(
  function*<A>(state: MultiSelectState, options: SelectOptionsReq<A>) {
    const figures = yield* getTheme(options)
    const choices = renderMultiSelectChoices(state, options, figures)
    const leadingSymbol = annotateSymbol(figures.prefix, figures.primaryColor)
    const trailingSymbol = annotateSymbol(figures.pointerSmall, figures.mutedColor)
    const promptMsg = renderSelectOutput(leadingSymbol, trailingSymbol, options)
    const error = renderMultiSelectError(state, figures.pointer, figures)
    return Ansi.cursorHide + withSelectHeader(promptMsg, choices) + error
  }
)

const renderMultiSelectSubmission = Effect.fnUntraced(
  function*<A>(state: MultiSelectState, options: SelectOptionsReq<A>) {
    const figures = yield* getTheme(options)
    const selectedChoices = Array.from(state.selectedIndices).sort(EffectNumber.Order).map((index) =>
      options.choices[index].title
    )
    const selectedText = selectedChoices.join(", ")
    const leadingSymbol = annotateSymbol(figures.tick, figures.successColor)
    const trailingSymbol = annotateSymbol(figures.ellipsis, figures.mutedColor)
    const promptMsg = renderSelectOutput(leadingSymbol, trailingSymbol, options) ?? leadingSymbol
    return promptMsg + " " + Ansi.annotate(selectedText, figures.submittedColor) + "\n"
  }
)

const processMultiSelectCursorUp = (state: MultiSelectState, totalChoices: number) => {
  const newIndex = state.index === 0 ? totalChoices - 1 : state.index - 1
  return Effect.succeed(Action.NextFrame({ state: { ...state, index: newIndex } }))
}

const processMultiSelectCursorDown = (state: MultiSelectState, totalChoices: number) => {
  const newIndex = (state.index + 1) % totalChoices
  return Effect.succeed(Action.NextFrame({ state: { ...state, index: newIndex } }))
}

const processSpace = <A>(
  state: MultiSelectState,
  options: SelectOptionsReq<A>
) => {
  const selectedIndices = new Set(state.selectedIndices)
  if (state.index === 0) {
    const selectableCount = options.choices.filter((choice) => !choice.disabled).length
    const selectedCount = Array.from(state.selectedIndices).filter((index) => !options.choices[index].disabled).length
    if (selectedCount === selectableCount) {
      selectedIndices.clear()
    } else {
      for (let i = 0; i < options.choices.length; i++) {
        if (!options.choices[i].disabled) {
          selectedIndices.add(i)
        }
      }
    }
  } else if (state.index === 1) {
    for (let i = 0; i < options.choices.length; i++) {
      if (options.choices[i].disabled || state.selectedIndices.has(i)) {
        selectedIndices.delete(i)
      } else {
        selectedIndices.add(i)
      }
    }
  } else {
    const choiceIndex = state.index - metaOptionsCount
    if (options.choices[choiceIndex].disabled) {
      return Effect.succeed(Action.Beep())
    } else if (selectedIndices.has(choiceIndex)) {
      selectedIndices.delete(choiceIndex)
    } else {
      selectedIndices.add(choiceIndex)
    }
  }
  return Effect.succeed(Action.NextFrame({ state: { ...state, selectedIndices } }))
}

const handleMultiSelectClear = <A>(options: SelectOptionsReq<A>) =>
  Effect.fnUntraced(function*(state: MultiSelectState, _: Action<MultiSelectState, Array<A>>) {
    const terminal = yield* Terminal.Terminal
    const columns = yield* terminal.columns
    const figures = yield* getTheme(options)
    const clearPrompt = Ansi.eraseLine + Ansi.cursorLeft
    const promptText = renderSelectOutput(figures.prefix, figures.pointerSmall, options, { plain: true })
    const choicesText = renderMultiSelectChoices(state, options, figures, { plain: true })
    const errorText = renderMultiSelectError(state, figures.pointer, figures, { plain: true })
    const clearOutput = clearOutputWithError(withSelectHeader(promptText, choicesText), columns, errorText)
    return clearOutput + clearPrompt
  })

const handleMultiSelectProcess = <A>(options: SelectOptionsReq<A> & MultiSelectOptionsReq) => {
  return (input: Terminal.UserInput, state: MultiSelectState) => {
    const totalChoices = options.choices.length + metaOptionsCount
    switch (input.key.name) {
      case "k":
      case "up": {
        return processMultiSelectCursorUp({ ...state, error: Option.none() }, totalChoices)
      }
      case "j":
      case "down":
      case "tab": {
        return processMultiSelectCursorDown({ ...state, error: Option.none() }, totalChoices)
      }
      case "space": {
        return processSpace(state, options)
      }
      case "enter":
      case "return": {
        const selectedIndices = Array.from(state.selectedIndices).filter((index) => !options.choices[index].disabled)
        const selectedCount = selectedIndices.length
        if (options.min !== undefined && selectedCount < options.min) {
          return Effect.succeed(
            Action.NextFrame({ state: { ...state, error: Option.some(`At least ${options.min} are required`) } })
          )
        }
        if (options.max !== undefined && selectedCount > options.max) {
          return Effect.succeed(
            Action.NextFrame({ state: { ...state, error: Option.some(`At most ${options.max} choices are allowed`) } })
          )
        }
        const selectedValues = selectedIndices.sort(EffectNumber.Order).map((index) => options.choices[index].value)
        return Effect.succeed(Action.Submit({ value: selectedValues }))
      }
      default: {
        return Effect.succeed(Action.Beep())
      }
    }
  }
}

const handleMultiSelectRender = <A>(options: SelectOptionsReq<A>) => {
  return (state: MultiSelectState, action: Action<MultiSelectState, Array<A>>) => {
    return Action.$match(action, {
      Beep: () => Effect.succeed(renderBeep),
      NextFrame: ({ state }) => renderMultiSelectNextFrame(state, options),
      Submit: () => renderMultiSelectSubmission(state, options)
    })
  }
}

interface IntOptionsReq extends OptionsReq<IntOptions> {}
interface NumberOptionsReq extends OptionsReq<NumberOptions> {}

interface NumberState {
  readonly cursor: number
  readonly value: string
  readonly error: Option.Option<string>
}

const handleNumberClear = (options: IntOptionsReq) => {
  return Effect.fnUntraced(function*(state: NumberState, _: Action<NumberState, number>) {
    const terminal = yield* Terminal.Terminal
    const columns = yield* terminal.columns
    const figures = yield* getTheme(options)
    const resetCurrentLine = Ansi.eraseLine + Ansi.cursorLeft
    const errorText = renderNumberError(state, figures.pointerSmall, figures, { plain: true })
    const promptText = renderNumberOutput(state, figures.prefix, figures.pointerSmall, options, figures, {
      plain: true
    })
    const clearOutput = clearOutputWithError(promptText, columns, errorText)
    return clearOutput + resetCurrentLine
  })
}

const renderNumberInput = (
  state: NumberState,
  submitted: boolean,
  theme: Theme,
  renderOptions?: RenderOptions | undefined
): string => {
  const value = state.value === "" ? "" : `${state.value}`
  if (submitted || renderOptions?.plain === true) {
    return value
  }
  const annotation = Option.isSome(state.error) ?
    theme.errorColor :
    Ansi.combine(Ansi.underlined, theme.primaryColor)
  return Ansi.annotate(value, annotation)
}

const renderNumberError = (
  state: NumberState,
  pointer: string,
  theme: Theme,
  renderOptions?: RenderOptions | undefined
) => {
  if (Option.isSome(state.error)) {
    return Arr.match(state.error.value.split(NEWLINE_REGEXP), {
      onEmpty: () => "",
      onNonEmpty: (errorLines) => {
        if (renderOptions?.plain === true) {
          return separateSymbol(pointer, errorLines.join("\n"))
        }
        const prefix = annotateSymbol(pointer, theme.errorColor)
        const lines = Arr.map(errorLines, (str) => annotateErrorLine(str, theme.errorColor))
        return Ansi.cursorSavePosition + "\n" + separateSymbol(prefix, lines.join("\n")) + Ansi.cursorRestorePosition
      }
    })
  }
  return ""
}

const renderNumberOutput = (
  state: NumberState,
  leadingSymbol: string,
  trailingSymbol: string,
  options: IntOptionsReq,
  theme: Theme,
  renderOptions?: RenderOptions | undefined,
  submitted: boolean = false
) => {
  const value = renderNumberInput(state, submitted, theme, renderOptions)
  return renderPrompt(value, options.message, leadingSymbol, trailingSymbol, renderOptions)
}

const renderNumberNextFrame = Effect.fnUntraced(function*(state: NumberState, options: IntOptionsReq) {
  const figures = yield* getTheme(options)
  const leadingSymbol = annotateSymbol(figures.prefix, figures.primaryColor)
  const trailingSymbol = annotateSymbol(figures.pointerSmall, figures.mutedColor)
  const errorMsg = renderNumberError(state, figures.pointerSmall, figures)
  const promptMsg = renderNumberOutput(state, leadingSymbol, trailingSymbol, options, figures)
  return promptMsg + errorMsg
})

const renderNumberSubmission = Effect.fnUntraced(function*(nextState: NumberState, options: IntOptionsReq) {
  const figures = yield* getTheme(options)
  const leadingSymbol = annotateSymbol(figures.tick, figures.successColor)
  const trailingSymbol = annotateSymbol(figures.ellipsis, figures.mutedColor)
  const promptMsg = renderNumberOutput(nextState, leadingSymbol, trailingSymbol, options, figures, undefined, true)
  return promptMsg + "\n"
})

const processNumberBackspace = (state: NumberState) => {
  if (state.value.length <= 0) {
    return Effect.succeed(Action.Beep())
  }
  const value = state.value.slice(0, state.value.length - 1)
  return Effect.succeed(Action.NextFrame({
    state: { ...state, value, error: Option.none() }
  }))
}

const processNumberClear = (state: NumberState) =>
  Effect.succeed(Action.NextFrame({
    state: { ...state, cursor: 0, value: "", error: Option.none() }
  }))

const defaultIntProcessor = (input: string, state: NumberState) => {
  if (state.value.length === 0 && input === "-") {
    return Effect.succeed(Action.NextFrame({
      state: { ...state, value: "-", error: Option.none() }
    }))
  }

  const parsed = globalThis.Number.parseInt(state.value + input)
  if (globalThis.Number.isNaN(parsed)) {
    return Effect.succeed(Action.Beep())
  } else {
    return Effect.succeed(Action.NextFrame({
      state: { ...state, value: `${parsed}`, error: Option.none() }
    }))
  }
}

const defaultFloatProcessor = (input: string, state: NumberState) => {
  if (input === "." && state.value.includes(".")) {
    return Effect.succeed(Action.Beep())
  }
  if (state.value.length === 0 && input === "-") {
    return Effect.succeed(Action.NextFrame({
      state: { ...state, value: "-", error: Option.none() }
    }))
  }

  const parsed = globalThis.Number.parseFloat(state.value + input)
  if (globalThis.Number.isNaN(parsed)) {
    return Effect.succeed(Action.Beep())
  } else {
    return Effect.succeed(Action.NextFrame({
      state: {
        ...state,
        value: input === "."
          ? `${parsed}.`
          : state.value.includes(".") && /^\d$/.test(input)
          ? state.value + input
          : `${parsed}`,
        error: Option.none()
      }
    }))
  }
}

const handleRenderInteger = (options: IntOptionsReq) => {
  return (state: NumberState, action: Action<NumberState, number>) => {
    return Action.$match(action, {
      Beep: () => Effect.succeed(renderBeep),
      NextFrame: ({ state }) => renderNumberNextFrame(state, options),
      Submit: () => renderNumberSubmission(state, options)
    })
  }
}

const handleProcessInteger = (options: IntOptionsReq) => {
  return (input: Terminal.UserInput, state: NumberState) => {
    if (input.key.ctrl && input.key.name === "u") {
      return processNumberClear(state)
    }
    switch (input.key.name) {
      case "backspace": {
        return processNumberBackspace(state)
      }
      case "k":
      case "up": {
        return Effect.succeed(Action.NextFrame({
          state: {
            ...state,
            value: state.value === "" || state.value === "-"
              ? `${options.incrementBy}`
              : `${globalThis.Number.parseInt(state.value) + options.incrementBy}`,
            error: Option.none()
          }
        }))
      }
      case "j":
      case "down": {
        return Effect.succeed(Action.NextFrame({
          state: {
            ...state,
            value: state.value === "" || state.value === "-"
              ? `-${options.decrementBy}`
              : `${globalThis.Number.parseInt(state.value) - options.decrementBy}`,
            error: Option.none()
          }
        }))
      }
      case "enter":
      case "return": {
        const parsed = globalThis.Number.parseInt(state.value)
        if (globalThis.Number.isNaN(parsed)) {
          return Effect.succeed(Action.NextFrame({
            state: {
              ...state,
              error: Option.some("Must provide an integer value")
            }
          }))
        } else {
          return Effect.match(options.validate(parsed), {
            onFailure: (error) =>
              Action.NextFrame({
                state: {
                  ...state,
                  error: Option.some(error)
                }
              }),
            onSuccess: (value) => Action.Submit({ value })
          })
        }
      }
      default: {
        return defaultIntProcessor(Option.getOrElse(input.input, () => ""), state)
      }
    }
  }
}

const handleRenderFloat = (options: NumberOptionsReq) => {
  return (state: NumberState, action: Action<NumberState, number>) => {
    return Action.$match(action, {
      Beep: () => Effect.succeed(renderBeep),
      NextFrame: ({ state }) => renderNumberNextFrame(state, options),
      Submit: () => renderNumberSubmission(state, options)
    })
  }
}

const handleProcessFloat = (options: NumberOptionsReq) => {
  return (input: Terminal.UserInput, state: NumberState) => {
    if (input.key.ctrl && input.key.name === "u") {
      return processNumberClear(state)
    }
    switch (input.key.name) {
      case "backspace": {
        return processNumberBackspace(state)
      }
      case "k":
      case "up": {
        return Effect.succeed(Action.NextFrame({
          state: {
            ...state,
            value: state.value === "" || state.value === "-"
              ? `${options.incrementBy}`
              : `${globalThis.Number.parseFloat(state.value) + options.incrementBy}`,
            error: Option.none()
          }
        }))
      }
      case "j":
      case "down": {
        return Effect.succeed(Action.NextFrame({
          state: {
            ...state,
            value: state.value === "" || state.value === "-"
              ? `-${options.decrementBy}`
              : `${globalThis.Number.parseFloat(state.value) - options.decrementBy}`,
            error: Option.none()
          }
        }))
      }
      case "enter":
      case "return": {
        const parsed = globalThis.Number.parseFloat(state.value)
        if (globalThis.Number.isNaN(parsed)) {
          return Effect.succeed(Action.NextFrame({
            state: {
              ...state,
              error: Option.some("Must provide a floating point value")
            }
          }))
        } else {
          return Effect.flatMap(
            Effect.sync(() => EffectNumber.round(parsed, options.precision)),
            (rounded) =>
              Effect.match(options.validate(rounded), {
                onFailure: (error) =>
                  Action.NextFrame({
                    state: {
                      ...state,
                      error: Option.some(error)
                    }
                  }),
                onSuccess: (value) => Action.Submit({ value })
              })
          )
        }
      }
      default: {
        return defaultFloatProcessor(Option.getOrElse(input.input, () => ""), state)
      }
    }
  }
}

type SelectState = number

type AutoCompleteState = {
  readonly query: string
  readonly index: number
  readonly filtered: ReadonlyArray<number>
}

interface AutoCompleteOptionsReq<A> extends OptionsReq<AutoCompleteOptions<A>> {}

const filterAutoCompleteChoices = <A>(choices: ReadonlyArray<SelectChoice<A>>, query: string) => {
  const normalizedQuery = query.toLowerCase()
  const indices: Array<number> = []
  for (let i = 0; i < choices.length; i++) {
    if (choices[i].title.toLowerCase().includes(normalizedQuery)) {
      indices.push(i)
    }
  }
  return indices
}

const updateAutoCompleteState = <A>(
  state: AutoCompleteState,
  options: AutoCompleteOptionsReq<A>,
  query: string
): AutoCompleteState => {
  const filtered = filterAutoCompleteChoices(options.choices, query)
  if (filtered.length === 0) {
    return { ...state, query, filtered, index: 0 }
  }
  if (filtered.includes(state.index)) {
    return { ...state, query, filtered }
  }
  return { ...state, query, filtered, index: filtered[0] }
}

const autoCompleteCursor = (state: AutoCompleteState) =>
  Option.getOrElse(Arr.findFirstIndex(state.filtered, (index) => index === state.index), () => 0)

const renderSelectOutput = <A>(
  leadingSymbol: string,
  trailingSymbol: string,
  options: SelectOptionsReq<A>,
  renderOptions?: RenderOptions | undefined
): string | undefined =>
  options.message === undefined
    ? undefined
    : renderPrompt("", options.message, leadingSymbol, trailingSymbol, renderOptions)

const withSelectHeader = (header: string | undefined, body: string): string =>
  header === undefined ? body : header + "\n" + body

const renderAutoCompleteFilter = <A>(
  state: AutoCompleteState,
  options: AutoCompleteOptionsReq<A>,
  theme: Theme,
  renderOptions?: RenderOptions | undefined
) => {
  const filterValue = state.query.length === 0
    ? renderOptions?.plain === true
      ? options.filterPlaceholder
      : Ansi.annotate(options.filterPlaceholder, theme.mutedColor)
    : renderOptions?.plain === true
    ? state.query
    : Ansi.annotate(state.query, Ansi.combine(Ansi.underlined, theme.primaryColor))
  return `[${options.filterLabel}: ${filterValue}]`
}

const renderAutoCompleteOutput = <A>(
  state: AutoCompleteState,
  leadingSymbol: string,
  trailingSymbol: string,
  options: AutoCompleteOptionsReq<A>,
  theme: Theme,
  renderOptions?: RenderOptions | undefined
) => {
  const filter = renderAutoCompleteFilter(state, options, theme, renderOptions)
  return renderPrompt(filter, options.message, leadingSymbol, trailingSymbol, renderOptions)
}

const renderChoicePrefix = <A>(
  state: SelectState,
  choices: SelectOptionsReq<A>["choices"],
  toDisplay: { readonly startIndex: number; readonly endIndex: number },
  currentIndex: number,
  figures: Theme,
  renderOptions?: RenderOptions | undefined
) => {
  const prefix = renderPagingPrefix(
    figures,
    currentIndex === toDisplay.startIndex && toDisplay.startIndex > 0,
    currentIndex === toDisplay.endIndex - 1 && toDisplay.endIndex < choices.length
  )
  if (renderOptions?.plain === true) {
    return state === currentIndex
      ? figures.pointer + prefix
      : prefix + " ".repeat(figures.pointer.length)
  }
  if (choices[currentIndex].disabled) {
    const annotation = Ansi.combine(Ansi.bold, figures.mutedColor)
    return state === currentIndex
      ? annotateSymbol(figures.pointer, annotation) + prefix
      : prefix + " ".repeat(figures.pointer.length)
  }
  return state === currentIndex
    ? annotateSymbol(figures.pointer, figures.primaryColor) + prefix
    : prefix + " ".repeat(figures.pointer.length)
}

const renderAutoCompleteChoicePrefix = <A>(
  state: AutoCompleteState,
  options: AutoCompleteOptionsReq<A>,
  toDisplay: { readonly startIndex: number; readonly endIndex: number },
  currentIndex: number,
  figures: Theme,
  renderOptions?: RenderOptions | undefined
) => {
  const prefix = renderPagingPrefix(
    figures,
    currentIndex === toDisplay.startIndex && toDisplay.startIndex > 0,
    currentIndex === toDisplay.endIndex - 1 && toDisplay.endIndex < state.filtered.length
  )
  const choiceIndex = state.filtered[currentIndex]
  if (renderOptions?.plain === true) {
    return state.index === choiceIndex
      ? figures.pointer + prefix
      : prefix + " ".repeat(figures.pointer.length)
  }
  const choice = options.choices[choiceIndex]
  if (choice.disabled) {
    const annotation = Ansi.combine(Ansi.bold, figures.mutedColor)
    return state.index === choiceIndex
      ? annotateSymbol(figures.pointer, annotation) + prefix
      : prefix + " ".repeat(figures.pointer.length)
  }
  return state.index === choiceIndex
    ? annotateSymbol(figures.pointer, figures.primaryColor) + prefix
    : prefix + " ".repeat(figures.pointer.length)
}

const renderChoiceTitle = <A>(
  choice: SelectChoice<A>,
  isSelected: boolean,
  theme: Theme,
  renderOptions?: RenderOptions | undefined
) => {
  if (renderOptions?.plain === true) {
    return choice.title
  }
  const title = choice.title
  if (isSelected) {
    return choice.disabled
      ? Ansi.annotate(title, Ansi.combine(Ansi.underlined, theme.mutedColor))
      : Ansi.annotate(title, Ansi.combine(Ansi.underlined, theme.primaryColor))
  }
  return choice.disabled
    ? Ansi.annotate(title, Ansi.combine(Ansi.strikethrough, theme.mutedColor))
    : title
}

const renderSelectChoices = <A>(
  state: SelectState,
  options: SelectOptionsReq<A>,
  figures: Theme,
  renderOptions?: RenderOptions | undefined
) => {
  const choices = options.choices
  const toDisplay = entriesToDisplay(state, choices.length, options.maxPerPage)
  const documents: Array<string> = []
  for (let index = toDisplay.startIndex; index < toDisplay.endIndex; index++) {
    const choice = choices[index]
    const isSelected = state === index
    const prefix = renderChoicePrefix(state, choices, toDisplay, index, figures, renderOptions)
    const title = renderChoiceTitle(choice, isSelected, figures, renderOptions)
    const description = renderChoiceDescription(choice, isSelected, figures, renderOptions)
    documents.push(prefix + title + " " + description)
  }
  return documents.join("\n")
}

const renderAutoCompleteChoices = <A>(
  state: AutoCompleteState,
  options: AutoCompleteOptionsReq<A>,
  figures: Theme,
  renderOptions?: RenderOptions | undefined
) => {
  if (state.filtered.length === 0) {
    return renderOptions?.plain === true
      ? options.emptyMessage
      : Ansi.annotate(options.emptyMessage, figures.mutedColor)
  }
  const cursor = autoCompleteCursor(state)
  const toDisplay = entriesToDisplay(cursor, state.filtered.length, options.maxPerPage)
  const documents: Array<string> = []
  for (let index = toDisplay.startIndex; index < toDisplay.endIndex; index++) {
    const choiceIndex = state.filtered[index]
    const choice = options.choices[choiceIndex]
    const isSelected = state.index === choiceIndex
    const prefix = renderAutoCompleteChoicePrefix(state, options, toDisplay, index, figures, renderOptions)
    const title = renderChoiceTitle(choice, isSelected, figures, renderOptions)
    const description = renderChoiceDescription(choice, isSelected, figures, renderOptions)
    documents.push(prefix + title + " " + description)
  }
  return documents.join("\n")
}

const renderSelectNextFrame = Effect.fnUntraced(function*<A>(state: SelectState, options: SelectOptionsReq<A>) {
  const figures = yield* getTheme(options)
  const choices = renderSelectChoices(state, options, figures)
  const leadingSymbol = annotateSymbol(figures.prefix, figures.primaryColor)
  const trailingSymbol = annotateSymbol(figures.pointerSmall, figures.mutedColor)
  const promptMsg = renderSelectOutput(leadingSymbol, trailingSymbol, options)
  return Ansi.cursorHide + withSelectHeader(promptMsg, choices)
})

const renderAutoCompleteNextFrame = Effect.fnUntraced(function*<A>(
  state: AutoCompleteState,
  options: AutoCompleteOptionsReq<A>
) {
  const figures = yield* getTheme(options)
  const choices = renderAutoCompleteChoices(state, options, figures)
  const leadingSymbol = annotateSymbol(figures.prefix, figures.primaryColor)
  const trailingSymbol = annotateSymbol(figures.pointerSmall, figures.mutedColor)
  const promptMsg = renderAutoCompleteOutput(state, leadingSymbol, trailingSymbol, options, figures)
  return Ansi.cursorHide + promptMsg + "\n" + choices
})

const renderSelectSubmission = Effect.fnUntraced(function*<A>(state: SelectState, options: SelectOptionsReq<A>) {
  const figures = yield* getTheme(options)
  const selected = options.choices[state].title
  const leadingSymbol = annotateSymbol(figures.tick, figures.successColor)
  const trailingSymbol = annotateSymbol(figures.ellipsis, figures.mutedColor)
  const promptMsg = renderSelectOutput(leadingSymbol, trailingSymbol, options) ?? leadingSymbol
  return promptMsg + " " + Ansi.annotate(selected, figures.submittedColor) + "\n"
})

const renderAutoCompleteSubmission = Effect.fnUntraced(function*<A>(
  state: AutoCompleteState,
  options: AutoCompleteOptionsReq<A>
) {
  const figures = yield* getTheme(options)
  const selected = options.choices[state.index].title
  const leadingSymbol = annotateSymbol(figures.tick, figures.successColor)
  const trailingSymbol = annotateSymbol(figures.ellipsis, figures.mutedColor)
  const promptMsg = renderAutoCompleteOutput(state, leadingSymbol, trailingSymbol, options, figures)
  return promptMsg + " " + Ansi.annotate(selected, figures.submittedColor) + "\n"
})

const processSelectCursorUp = <A>(state: SelectState, choices: SelectOptionsReq<A>["choices"]) => {
  if (state === 0) {
    return Effect.succeed(Action.NextFrame({ state: choices.length - 1 }))
  }
  return Effect.succeed(Action.NextFrame({ state: state - 1 }))
}

const processSelectCursorDown = <A>(state: SelectState, choices: SelectOptionsReq<A>["choices"]) => {
  if (state === choices.length - 1) {
    return Effect.succeed(Action.NextFrame({ state: 0 }))
  }
  return Effect.succeed(Action.NextFrame({ state: state + 1 }))
}

const processSelectNext = <A>(state: SelectState, choices: SelectOptionsReq<A>["choices"]) => {
  return Effect.succeed(Action.NextFrame({ state: (state + 1) % choices.length }))
}

const processAutoCompleteCursorUp = (state: AutoCompleteState) => {
  if (state.filtered.length === 0) {
    return Effect.succeed(Action.Beep())
  }
  const cursor = autoCompleteCursor(state)
  const nextCursor = cursor === 0 ? state.filtered.length - 1 : cursor - 1
  return Effect.succeed(Action.NextFrame({ state: { ...state, index: state.filtered[nextCursor] } }))
}

const processAutoCompleteCursorDown = (state: AutoCompleteState) => {
  if (state.filtered.length === 0) {
    return Effect.succeed(Action.Beep())
  }
  const cursor = autoCompleteCursor(state)
  const nextCursor = (cursor + 1) % state.filtered.length
  return Effect.succeed(Action.NextFrame({ state: { ...state, index: state.filtered[nextCursor] } }))
}

const processAutoCompleteNext = (state: AutoCompleteState) => processAutoCompleteCursorDown(state)

const processAutoCompleteBackspace = <A>(state: AutoCompleteState, options: AutoCompleteOptionsReq<A>) => {
  if (state.query.length === 0) {
    return Effect.succeed(Action.Beep())
  }
  const query = state.query.slice(0, state.query.length - 1)
  return Effect.succeed(Action.NextFrame({ state: updateAutoCompleteState(state, options, query) }))
}

const processAutoCompleteClear = <A>(state: AutoCompleteState, options: AutoCompleteOptionsReq<A>) =>
  Effect.succeed(Action.NextFrame({ state: updateAutoCompleteState(state, options, "") }))

const processAutoCompleteInput = <A>(input: string, state: AutoCompleteState, options: AutoCompleteOptionsReq<A>) => {
  if (input.length === 0) {
    return Effect.succeed(Action.Beep())
  }
  const query = state.query + input
  return Effect.succeed(Action.NextFrame({ state: updateAutoCompleteState(state, options, query) }))
}

const handleSelectRender = <A>(options: SelectOptionsReq<A>) => {
  return (state: SelectState, action: Action<SelectState, A>) => {
    return Action.$match(action, {
      Beep: () => Effect.succeed(renderBeep),
      NextFrame: ({ state }) => renderSelectNextFrame(state, options),
      Submit: () => renderSelectSubmission(state, options)
    })
  }
}

const handleAutoCompleteRender = <A>(options: AutoCompleteOptionsReq<A>) => {
  return (state: AutoCompleteState, action: Action<AutoCompleteState, A>) => {
    return Action.$match(action, {
      Beep: () => Effect.succeed(renderBeep),
      NextFrame: ({ state }) => renderAutoCompleteNextFrame(state, options),
      Submit: () => renderAutoCompleteSubmission(state, options)
    })
  }
}

const handleSelectClear = <A>(options: SelectOptionsReq<A>) =>
  Effect.fnUntraced(function*(state: SelectState, _: Action<SelectState, A>) {
    const terminal = yield* Terminal.Terminal
    const columns = yield* terminal.columns
    const figures = yield* getTheme(options)
    const clearPrompt = Ansi.eraseLine + Ansi.cursorLeft
    const promptText = renderSelectOutput(figures.prefix, figures.pointerSmall, options, { plain: true })
    const choicesText = renderSelectChoices(state, options, figures, { plain: true })
    const clearOutput = eraseText(withSelectHeader(promptText, choicesText), columns)
    return clearOutput + clearPrompt
  })

const handleAutoCompleteClear = <A>(options: AutoCompleteOptionsReq<A>) =>
  Effect.fnUntraced(function*(state: AutoCompleteState, _: Action<AutoCompleteState, A>) {
    const terminal = yield* Terminal.Terminal
    const columns = yield* terminal.columns
    const figures = yield* getTheme(options)
    const clearPrompt = Ansi.eraseLine + Ansi.cursorLeft
    const promptText = renderAutoCompleteOutput(
      state,
      figures.prefix,
      figures.pointerSmall,
      options,
      figures,
      { plain: true }
    )
    const choicesText = renderAutoCompleteChoices(state, options, figures, { plain: true })
    const clearOutput = eraseText(`${promptText}\n${choicesText}`, columns)
    return clearOutput + clearPrompt
  })

const handleSelectProcess = <A>(options: SelectOptionsReq<A>) => {
  return (input: Terminal.UserInput, state: SelectState) => {
    switch (input.key.name) {
      case "k":
      case "up": {
        return processSelectCursorUp(state, options.choices)
      }
      case "j":
      case "down": {
        return processSelectCursorDown(state, options.choices)
      }
      case "tab": {
        return processSelectNext(state, options.choices)
      }
      case "enter":
      case "return": {
        const selected = options.choices[state]
        if (selected.disabled) {
          return Effect.succeed(Action.Beep())
        }
        return Effect.succeed(Action.Submit({ value: selected.value }))
      }
      default: {
        return Effect.succeed(Action.Beep())
      }
    }
  }
}

const handleAutoCompleteProcess = <A>(options: AutoCompleteOptionsReq<A>) => {
  return (input: Terminal.UserInput, state: AutoCompleteState) => {
    // Navigation is bound to ctrl chords rather than bare `j`/`k`, so that every
    // printable character reaches the filter input.
    if (input.key.ctrl) {
      switch (input.key.name) {
        case "u": {
          return processAutoCompleteClear(state, options)
        }
        case "p":
        case "k": {
          return processAutoCompleteCursorUp(state)
        }
        case "n": {
          return processAutoCompleteCursorDown(state)
        }
        default: {
          return Effect.succeed(Action.Beep())
        }
      }
    }
    switch (input.key.name) {
      case "up": {
        return processAutoCompleteCursorUp(state)
      }
      case "down": {
        return processAutoCompleteCursorDown(state)
      }
      case "tab": {
        return processAutoCompleteNext(state)
      }
      case "backspace": {
        return processAutoCompleteBackspace(state, options)
      }
      case "enter":
      case "return": {
        if (state.filtered.length === 0) {
          return Effect.succeed(Action.Beep())
        }
        const selected = options.choices[state.index]
        if (selected.disabled) {
          return Effect.succeed(Action.Beep())
        }
        return Effect.succeed(Action.Submit({ value: selected.value }))
      }
      default: {
        return processAutoCompleteInput(Option.getOrElse(input.input, () => ""), state, options)
      }
    }
  }
}

interface TextOptionsReq extends OptionsReq<TextOptions> {
  /**
   * The type of the text option.
   */
  readonly type: "hidden" | "password" | "text"
}

interface TextState {
  readonly cursor: number
  readonly value: string
  readonly error: Option.Option<string>
}

const renderClearScreen = Effect.fnUntraced(function*(state: TextState, options: TextOptionsReq) {
  const terminal = yield* Terminal.Terminal
  const columns = yield* terminal.columns
  const figures = yield* getTheme(options)
  const resetCurrentLine = Ansi.eraseLine + Ansi.cursorLeft
  const errorText = renderTextError(state, figures.pointerSmall, figures, { plain: true })
  const clearOutput = clearOutputWithError(
    renderTextOutput(state, figures.prefix, figures.pointerSmall, options, figures, { plain: true }),
    columns,
    errorText
  )
  return clearOutput + resetCurrentLine
})

const renderTextInput = (
  nextState: TextState,
  options: TextOptionsReq,
  theme: Theme,
  submitted: boolean,
  renderOptions?: RenderOptions | undefined
) => {
  const text = nextState.value
  if (renderOptions?.plain === true) {
    switch (options.type) {
      case "hidden": {
        return ""
      }
      case "password": {
        return theme.passwordMask.repeat(text.length)
      }
      case "text": {
        return text
      }
    }
  }

  if (text.length === 0) {
    // Avoid wrapping an empty value in ANSI codes, which would make renderPrompt
    // add spacing for content that occupies no terminal columns.
    return ""
  }

  const annotation = Option.isSome(nextState.error) ?
    theme.errorColor
    : submitted ?
    theme.submittedColor
    : Ansi.combine(Ansi.underlined, theme.primaryColor)

  switch (options.type) {
    case "hidden": {
      return ""
    }
    case "password": {
      return annotateSymbol(theme.passwordMask.repeat(text.length), annotation)
    }
    case "text": {
      return Ansi.annotate(text, annotation)
    }
  }
}

const renderTextError = (
  nextState: TextState,
  pointer: string,
  theme: Theme,
  renderOptions?: RenderOptions | undefined
): string => {
  if (Option.isSome(nextState.error)) {
    return Arr.match(nextState.error.value.split(NEWLINE_REGEXP), {
      onEmpty: () => "",
      onNonEmpty: (errorLines) => {
        if (renderOptions?.plain === true) {
          return separateSymbol(pointer, errorLines.join("\n"))
        }
        const prefix = annotateSymbol(pointer, theme.errorColor)
        const lines = Arr.map(errorLines, (str) => annotateErrorLine(str, theme.errorColor))
        return Ansi.cursorSavePosition + "\n" + separateSymbol(prefix, lines.join("\n")) + Ansi.cursorRestorePosition
      }
    })
  }
  return ""
}

const renderTextOutput = (
  nextState: TextState,
  leadingSymbol: string,
  trailingSymbol: string,
  options: TextOptionsReq,
  theme: Theme,
  renderOptions?: RenderOptions | undefined,
  submitted: boolean = false
) => {
  const value = renderTextInput(nextState, options, theme, submitted, renderOptions)
  return renderPrompt(value, options.message, leadingSymbol, trailingSymbol, renderOptions)
}

const renderTextNextFrame = Effect.fnUntraced(function*(state: TextState, options: TextOptionsReq) {
  const figures = yield* getTheme(options)
  const leadingSymbol = annotateSymbol(figures.prefix, figures.primaryColor)
  const trailingSymbol = annotateSymbol(figures.pointerSmall, figures.mutedColor)
  const promptMsg = renderTextOutput(state, leadingSymbol, trailingSymbol, options, figures)
  const errorMsg = renderTextError(state, figures.pointerSmall, figures)
  const cursorWidth = options.type === "password" ? figures.passwordMask.length : 1
  const offset = (state.cursor - state.value.length) * cursorWidth
  return promptMsg + errorMsg + Ansi.cursorMove(offset)
})

const renderTextSubmission = Effect.fnUntraced(function*(state: TextState, options: TextOptionsReq) {
  const figures = yield* getTheme(options)
  const leadingSymbol = annotateSymbol(figures.tick, figures.successColor)
  const trailingSymbol = annotateSymbol(figures.ellipsis, figures.mutedColor)
  const promptMsg = renderTextOutput(state, leadingSymbol, trailingSymbol, options, figures, undefined, true)
  return promptMsg + "\n"
})

const processTextBackspace = (state: TextState) => {
  if (state.cursor <= 0) {
    return Effect.succeed(Action.Beep())
  }
  const beforeCursor = state.value.slice(0, state.cursor - 1)
  const afterCursor = state.value.slice(state.cursor)
  const cursor = state.cursor - 1
  const value = `${beforeCursor}${afterCursor}`
  return Effect.succeed(
    Action.NextFrame({
      state: { ...state, cursor, value, error: Option.none() }
    })
  )
}

const processTextClear = (state: TextState) =>
  Effect.succeed(
    Action.NextFrame({
      state: { ...state, cursor: 0, value: "", error: Option.none() }
    })
  )

const processTextCursorLeft = (state: TextState) => {
  if (state.cursor <= 0) {
    return Effect.succeed(Action.Beep())
  }
  const cursor = state.cursor - 1
  return Effect.succeed(
    Action.NextFrame({
      state: { ...state, cursor, error: Option.none() }
    })
  )
}

const processTextCursorRight = (state: TextState) => {
  if (state.cursor >= state.value.length) {
    return Effect.succeed(Action.Beep())
  }
  const cursor = Math.min(state.cursor + 1, state.value.length)
  return Effect.succeed(
    Action.NextFrame({
      state: { ...state, cursor, error: Option.none() }
    })
  )
}

const processTextCursorStart = (state: TextState) =>
  Effect.succeed(
    Action.NextFrame({
      state: { ...state, cursor: 0, error: Option.none() }
    })
  )

const processTextCursorEnd = (state: TextState) =>
  Effect.succeed(
    Action.NextFrame({
      state: { ...state, cursor: state.value.length, error: Option.none() }
    })
  )

const processTab = (state: TextState, options: TextOptionsReq) => {
  if (state.value === options.default) {
    return Effect.succeed(Action.Beep())
  }
  const value = state.value.length === 0 ? options.default : state.value
  return Effect.succeed(
    Action.NextFrame({
      state: { ...state, value, cursor: value.length, error: Option.none() }
    })
  )
}

const defaultTextProcessor = (input: string, state: TextState) => {
  const beforeCursor = state.value.slice(0, state.cursor)
  const afterCursor = state.value.slice(state.cursor)
  const value = `${beforeCursor}${input}${afterCursor}`
  const cursor = state.cursor + input.length
  return Effect.succeed(
    Action.NextFrame({
      state: { ...state, cursor, value, error: Option.none() }
    })
  )
}

const handleTextRender = (options: TextOptionsReq) => {
  return (state: TextState, action: Action<TextState, string>) => {
    return Action.$match(action, {
      Beep: () => Effect.succeed(renderBeep),
      NextFrame: ({ state }) => renderTextNextFrame(state, options),
      Submit: () => renderTextSubmission(state, options)
    })
  }
}

const handleTextProcess = (options: TextOptionsReq) => {
  return (input: Terminal.UserInput, state: TextState) => {
    if (input.key.ctrl) {
      switch (input.key.name) {
        case "u": {
          return processTextClear(state)
        }
        case "a": {
          return processTextCursorStart(state)
        }
        case "e": {
          return processTextCursorEnd(state)
        }
        default: {
          return Effect.succeed(Action.Beep())
        }
      }
    }
    switch (input.key.name) {
      case "backspace": {
        return processTextBackspace(state)
      }
      case "left": {
        return processTextCursorLeft(state)
      }
      case "right": {
        return processTextCursorRight(state)
      }
      case "home": {
        return processTextCursorStart(state)
      }
      case "end": {
        return processTextCursorEnd(state)
      }
      case "enter":
      case "return": {
        const value = state.value
        return Effect.match(options.validate(value), {
          onFailure: (error) =>
            Action.NextFrame({
              state: { ...state, value, error: Option.some(error) }
            }),
          onSuccess: (value) => Action.Submit({ value })
        })
      }
      case "tab": {
        return processTab(state, options)
      }
      default: {
        return defaultTextProcessor(Option.getOrElse(input.input, () => ""), state)
      }
    }
  }
}

const handleTextClear = (options: TextOptionsReq) => {
  return (state: TextState, _: Action<TextState, string>) => {
    return renderClearScreen(state, options)
  }
}

const basePrompt = (
  options: TextOptions,
  type: TextOptionsReq["type"]
): Prompt<string> => {
  const opts: TextOptionsReq = {
    default: "",
    type,
    validate: Effect.succeed,
    ...options
  }

  const initialState: TextState = {
    cursor: opts.default.length,
    value: opts.default,
    error: Option.none()
  }
  return Custom(initialState, {
    render: handleTextRender(opts),
    process: handleTextProcess(opts),
    clear: handleTextClear(opts)
  })
}

interface ToggleOptionsReq extends OptionsReq<ToggleOptions> {}

type ToggleState = boolean

const handleToggleClear = Effect.fnUntraced(function*(options: ToggleOptionsReq) {
  const terminal = yield* Terminal.Terminal
  const columns = yield* terminal.columns
  const figures = yield* getTheme(options)
  const clearPrompt = Ansi.eraseLine + Ansi.cursorLeft
  const toggleText = options.active + " " + separateSymbol(figures.toggleSeparator, options.inactive)
  const promptText = renderPrompt(toggleText, options.message, figures.prefix, figures.pointerSmall, { plain: true })
  const clearOutput = eraseText(promptText, columns)
  return clearOutput + clearPrompt
})

const renderToggle = (
  value: boolean,
  options: ToggleOptionsReq,
  theme: Theme,
  submitted: boolean = false
) => {
  const separator = annotateSymbol(theme.toggleSeparator, theme.mutedColor)
  const selectedAnnotation = Ansi.combine(
    Ansi.underlined,
    submitted ? theme.submittedColor : theme.primaryColor
  )
  const inactive = value
    ? options.inactive
    : Ansi.annotate(options.inactive, selectedAnnotation)
  const active = value
    ? Ansi.annotate(options.active, selectedAnnotation)
    : options.active
  return active + " " + separateSymbol(separator, inactive)
}

const renderToggleOutput = (
  toggle: string,
  leadingSymbol: string,
  trailingSymbol: string,
  options: ToggleOptionsReq
) => {
  return renderPrompt(toggle, options.message, leadingSymbol, trailingSymbol)
}

const renderToggleNextFrame = Effect.fnUntraced(function*(state: ToggleState, options: ToggleOptionsReq) {
  const figures = yield* getTheme(options)
  const leadingSymbol = annotateSymbol(figures.prefix, figures.primaryColor)
  const trailingSymbol = annotateSymbol(figures.pointerSmall, figures.mutedColor)
  const toggle = renderToggle(state, options, figures)
  const promptMsg = renderToggleOutput(toggle, leadingSymbol, trailingSymbol, options)
  return Ansi.cursorHide + promptMsg
})

const renderToggleSubmission = Effect.fnUntraced(function*(value: boolean, options: ToggleOptionsReq) {
  const figures = yield* getTheme(options)
  const leadingSymbol = annotateSymbol(figures.tick, figures.successColor)
  const trailingSymbol = annotateSymbol(figures.ellipsis, figures.mutedColor)
  const toggle = renderToggle(value, options, figures, true)
  const promptMsg = renderToggleOutput(toggle, leadingSymbol, trailingSymbol, options)
  return promptMsg + "\n"
})

const activate = Effect.succeed(Action.NextFrame({ state: true }))
const deactivate = Effect.succeed(Action.NextFrame({ state: false }))

const handleToggleRender = (options: ToggleOptionsReq) => {
  return (state: ToggleState, action: Action<ToggleState, boolean>) => {
    switch (action._tag) {
      case "Beep": {
        return Effect.succeed(renderBeep)
      }
      case "NextFrame": {
        return renderToggleNextFrame(state, options)
      }
      case "Submit": {
        return renderToggleSubmission(state, options)
      }
    }
  }
}

const handleToggleProcess = (input: Terminal.UserInput, state: ToggleState) => {
  switch (input.key.name) {
    case "0":
    case "j":
    case "delete":
    case "right":
    case "down": {
      return deactivate
    }
    case "1":
    case "k":
    case "left":
    case "up": {
      return activate
    }
    case " ":
    case "tab": {
      return state ? deactivate : activate
    }
    case "enter":
    case "return": {
      return Effect.succeed(Action.Submit({ value: state }))
    }
    default: {
      return Effect.succeed(Action.Beep())
    }
  }
}

const entriesToDisplay = (cursor: number, total: number, maxVisible?: number) => {
  const max = maxVisible === undefined ? total : maxVisible
  let startIndex = Math.min(total - max, cursor - Math.floor(max / 2))
  if (startIndex < 0) {
    startIndex = 0
  }
  const endIndex = Math.min(startIndex + max, total)
  return { startIndex, endIndex }
}
