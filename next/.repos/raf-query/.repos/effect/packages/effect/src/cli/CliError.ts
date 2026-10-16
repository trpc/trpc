/**
 * Defines structured errors for the unstable CLI parser and runner.
 *
 * CLI errors describe problems such as unknown or duplicate flags, missing
 * flags or arguments, unexpected positional arguments, invalid values, unknown
 * subcommands, user handler failures, and requests to show command help. This
 * module includes the `CliError` union, the `isCliError` guard, schema-backed
 * error classes with display messages, and the `NonShowHelpErrors` union used
 * when parse or validation errors should be shown with help output.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Predicate from "../Predicate.ts"
import * as Runtime from "../Runtime.ts"
import * as Schema from "../Schema.ts"

/**
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
const TypeId = "~effect/cli/CliError"

/**
 * Type guard to check if a value is a CLI error.
 *
 * **Example** (Checking CLI errors)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * import { CliError } from "effect/cli"
 *
 * const error = new CliError.MissingOption({ option: "api-key" })
 * const program = CliError.isCliError(error)
 *   ? Effect.succeed(error.message)
 *   : Effect.fail("Unknown error")
 *
 * await Effect.runPromise(program) // => "Missing required flag: --api-key"
 * ```
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isCliError = (u: unknown): u is CliError => Predicate.hasProperty(u, TypeId)

/**
 * Union type representing all possible CLI error conditions.
 *
 * **Example** (Handling CLI errors)
 *
 * ```ts import.meta.vitest
 * import { CliError } from "effect/cli"
 *
 * const describe = (error: CliError.CliError): string => {
 *   switch (error._tag) {
 *     case "UnrecognizedOption":
 *       return `Unknown flag: ${error.option}`
 *     case "MissingOption":
 *       return `Required flag missing: ${error.option}`
 *     case "InvalidValue":
 *       return `Invalid value: ${error.value} for ${error.option}`
 *     case "ShowHelp":
 *       return `Help requested for: ${error.commandPath.join(" ")}`
 *     default:
 *       return error.message
 *   }
 * }
 *
 * describe(new CliError.MissingOption({ option: "token" })) // => "Required flag missing: token"
 * ```
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export type CliError =
  | UnrecognizedOption
  | DuplicateOption
  | MissingOption
  | MissingArgument
  | UnexpectedArgument
  | InvalidValue
  | UnknownSubcommand
  | ShowHelp
  | UserError

/**
 * Error thrown when an unrecognized option is encountered.
 *
 * **Example** (Creating unrecognized option errors)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * import { CliError } from "effect/cli"
 *
 * // Creating an unrecognized option error
 * const unrecognizedError = new CliError.UnrecognizedOption({
 *   option: "--unknown-flag",
 *   command: ["deploy", "production"],
 *   suggestions: ["--verbose", "--force"]
 * })
 *
 * unrecognizedError._tag // => "UnrecognizedOption"
 * unrecognizedError.option // => "--unknown-flag"
 * unrecognizedError.command // => ["deploy", "production"]
 *
 * // In CLI parsing context
 * const parseCommand = Effect.gen(function*() {
 *   // If parsing encounters unknown flag
 *   return yield* unrecognizedError
 * })
 *
 * const parseError = await Effect.runPromise(Effect.flip(parseCommand))
 * parseError._tag // => "UnrecognizedOption"
 * ```
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class UnrecognizedOption extends Schema.TaggedError<UnrecognizedOption>(
  `${TypeId}/UnrecognizedOption`
)("UnrecognizedOption", {
  option: Schema.String,
  command: Schema.optional(Schema.Array(Schema.String)),
  suggestions: Schema.Array(Schema.String)
}) {
  /**
   * Marks this value as a CLI parsing error for runtime guards.
   *
   * @stability unstable
   * @since 4.0.0
   */
  readonly [TypeId] = TypeId

  /**
   * Formats the unrecognized option with command context and suggestions.
   *
   * @stability unstable
   * @since 4.0.0
   */
  override get message() {
    const suggestionText = this.suggestions.length > 0
      ? `\n\n  Did you mean this?\n    ${this.suggestions.join("\n    ")}`
      : ""
    const baseMessage = this.command
      ? `Unrecognized flag: ${this.option} in command ${this.command.join(" ")}`
      : `Unrecognized flag: ${this.option}`
    return baseMessage + suggestionText
  }
}

/**
 * Error thrown when duplicate option names are detected between parent and child commands.
 *
 * **Example** (Creating duplicate option errors)
 *
 * ```ts import.meta.vitest
 * import { CliError } from "effect/cli"
 *
 * const duplicateError = new CliError.DuplicateOption({
 *   option: "--verbose",
 *   parentCommand: "myapp",
 *   childCommand: "deploy"
 * })
 *
 * duplicateError._tag // => "DuplicateOption"
 * duplicateError.option // => "--verbose"
 * duplicateError.parentCommand // => "myapp"
 * duplicateError.childCommand // => "deploy"
 * ```
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class DuplicateOption extends Schema.TaggedError<DuplicateOption>(
  `${TypeId}/DuplicateOption`
)("DuplicateOption", {
  option: Schema.String,
  parentCommand: Schema.String,
  childCommand: Schema.String
}) {
  /**
   * Marks this value as a CLI configuration error for runtime guards.
   *
   * @stability unstable
   * @since 4.0.0
   */
  readonly [TypeId] = TypeId

  /**
   * Explains which parent and child commands define the duplicate option.
   *
   * @stability unstable
   * @since 4.0.0
   */
  override get message() {
    return `Duplicate flag name "${this.option}" in parent command "${this.parentCommand}" and subcommand "${this.childCommand}". ` +
      `Parent will always claim this flag (Mode A semantics). Consider renaming one of them to avoid confusion.`
  }
}

/**
 * Error thrown when a required option is missing.
 *
 * **Example** (Creating missing option errors)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * import { CliError } from "effect/cli"
 *
 * const missingOptionError = new CliError.MissingOption({
 *   option: "api-key"
 * })
 *
 * const details = [missingOptionError._tag, missingOptionError.option] // => ["MissingOption", "api-key"]
 *
 * // In validation context
 * const validateRequiredOptions = (options: Record<string, string | undefined>) =>
 *   Effect.gen(function*() {
 *     const apiKey = options["api-key"]
 *     if (!apiKey) {
 *       return yield* missingOptionError
 *     }
 *     return apiKey
 *   })
 *
 * const validationError = await Effect.runPromise(Effect.flip(validateRequiredOptions({})))
 * validationError._tag // => "MissingOption"
 * ```
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class MissingOption extends Schema.TaggedError<MissingOption>(
  `${TypeId}/MissingOption`
)("MissingOption", {
  option: Schema.String
}) {
  /**
   * Marks this value as a missing CLI option error for runtime guards.
   *
   * @stability unstable
   * @since 4.0.0
   */
  readonly [TypeId] = TypeId

  /**
   * Formats the missing required flag for display.
   *
   * @stability unstable
   * @since 4.0.0
   */
  override get message() {
    return `Missing required flag: --${this.option}`
  }
}

/**
 * Error thrown when a required positional argument is missing.
 *
 * **Example** (Creating missing argument errors)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * import { CliError } from "effect/cli"
 *
 * const missingArgError = new CliError.MissingArgument({
 *   argument: "target"
 * })
 *
 * const details = [missingArgError._tag, missingArgError.argument] // => ["MissingArgument", "target"]
 *
 * // In argument parsing
 * const parseArguments = (args: Array<string>) =>
 *   Effect.gen(function*() {
 *     if (args.length === 0) {
 *       return yield* missingArgError
 *     }
 *     return args[0]
 *   })
 *
 * const parseError = await Effect.runPromise(Effect.flip(parseArguments([])))
 * parseError._tag // => "MissingArgument"
 * ```
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class MissingArgument extends Schema.TaggedError<MissingArgument>(
  `${TypeId}/MissingArgument`
)("MissingArgument", {
  argument: Schema.String
}) {
  /**
   * Marks this value as a missing CLI argument error for runtime guards.
   *
   * @stability unstable
   * @since 4.0.0
   */
  readonly [TypeId] = TypeId

  /**
   * Formats the missing required positional argument for display.
   *
   * @stability unstable
   * @since 4.0.0
   */
  override get message() {
    return `Missing required argument: ${this.argument}`
  }
}

/**
 * Error thrown when positional arguments remain after a command has parsed all
 * of its parameters.
 *
 * **Example** (Reporting unexpected arguments)
 *
 * ```ts import.meta.vitest
 * import { CliError } from "effect/cli"
 *
 * const error = new CliError.UnexpectedArgument({
 *   arguments: ["extra.txt"]
 * })
 *
 * const details = [error._tag, error.arguments] // => ["UnexpectedArgument", ["extra.txt"]]
 * ```
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class UnexpectedArgument extends Schema.TaggedError<UnexpectedArgument>(
  `${TypeId}/UnexpectedArgument`
)("UnexpectedArgument", {
  arguments: Schema.Array(Schema.String)
}) {
  /**
   * Marks this value as an unexpected CLI argument error for runtime guards.
   *
   * @stability unstable
   * @since 4.0.0
   */
  readonly [TypeId] = TypeId

  /**
   * Formats the unexpected positional arguments for display.
   *
   * @stability unstable
   * @since 4.0.0
   */
  override get message() {
    const label = this.arguments.length === 1 ? "argument" : "arguments"
    return `Unexpected positional ${label}: ${this.arguments.map((value) => JSON.stringify(value)).join(", ")}`
  }
}

/**
 * Error thrown when an option or argument value is invalid.
 *
 * **Example** (Creating invalid value errors)
 *
 * ```ts import.meta.vitest
 * import { CliError } from "effect/cli"
 *
 * const invalidValueError = new CliError.InvalidValue({
 *   option: "port",
 *   value: "abc123",
 *   expected: "integer between 1 and 65535",
 *   kind: "flag"
 * })
 *
 * invalidValueError._tag // => "InvalidValue"
 * invalidValueError.kind // => "flag"
 * invalidValueError.option // => "port"
 * invalidValueError.value // => "abc123"
 *
 * // For positional arguments
 * const invalidArgError = new CliError.InvalidValue({
 *   option: "count",
 *   value: "abc",
 *   expected: "integer",
 *   kind: "argument"
 * })
 *
 * const details = [invalidArgError.kind, invalidArgError.option, invalidArgError.value] // => ["argument", "count", "abc"]
 * ```
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class InvalidValue extends Schema.TaggedError<InvalidValue>(
  `${TypeId}/InvalidValue`
)("InvalidValue", {
  option: Schema.String,
  value: Schema.String,
  expected: Schema.String,
  kind: Schema.Union([Schema.Literal("flag"), Schema.Literal("argument")])
}) {
  /**
   * Marks this value as an invalid CLI value error for runtime guards.
   *
   * @stability unstable
   * @since 4.0.0
   */
  readonly [TypeId] = TypeId

  /**
   * Formats the invalid flag or argument value with the expected input.
   *
   * @stability unstable
   * @since 4.0.0
   */
  override get message() {
    const expectation = this.expected.startsWith("Expected ") || this.expected.startsWith("Expected:")
      ? this.expected
      : `Expected: ${this.expected}`
    if (this.kind === "argument") {
      return `Invalid value for argument <${this.option}>: "${this.value}". ${expectation}`
    }
    if (this.value.length === 0) {
      return `Missing value for flag --${this.option}. ${expectation}`
    }
    return `Invalid value for flag --${this.option}: "${this.value}". ${expectation}`
  }
}

/**
 * Error thrown when an unknown subcommand is encountered.
 *
 * **Example** (Creating unknown subcommand errors)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * import { CliError } from "effect/cli"
 *
 * const unknownSubcommandError = new CliError.UnknownSubcommand({
 *   subcommand: "deplyo", // typo
 *   parent: ["myapp"],
 *   suggestions: ["deploy", "destroy"]
 * })
 *
 * unknownSubcommandError._tag // => "UnknownSubcommand"
 * unknownSubcommandError.subcommand // => "deplyo"
 * unknownSubcommandError.parent // => ["myapp"]
 *
 * // In subcommand parsing
 * const parseSubcommand = (subcommand: string) =>
 *   Effect.gen(function*() {
 *     const validCommands = ["deploy", "destroy", "status"]
 *     if (!validCommands.includes(subcommand)) {
 *       return yield* unknownSubcommandError
 *     }
 *     return subcommand
 *   })
 *
 * const parseError = await Effect.runPromise(Effect.flip(parseSubcommand("deplyo")))
 * parseError._tag // => "UnknownSubcommand"
 * ```
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class UnknownSubcommand extends Schema.TaggedError<UnknownSubcommand>(
  `${TypeId}/UnknownSubcommand`
)("UnknownSubcommand", {
  subcommand: Schema.String,
  parent: Schema.optional(Schema.Array(Schema.String)),
  suggestions: Schema.Array(Schema.String)
}) {
  /**
   * Marks this value as an unknown CLI subcommand error for runtime guards.
   *
   * @stability unstable
   * @since 4.0.0
   */
  readonly [TypeId] = TypeId

  /**
   * Formats the unknown subcommand with parent command context and suggestions.
   *
   * @stability unstable
   * @since 4.0.0
   */
  override get message() {
    const suggestionText = this.suggestions.length > 0
      ? `\n\n  Did you mean this?\n    ${this.suggestions.join("\n    ")}`
      : ""
    return this.parent
      ? `Unknown subcommand "${this.subcommand}" for "${this.parent.join(" ")}"${suggestionText}`
      : `Unknown subcommand "${this.subcommand}"${suggestionText}`
  }
}

/**
 * Error wrapper for user handler failures in the CLI error channel.
 *
 * **Details**
 *
 * `userMessage` can provide safe, user-facing text independently of the
 * underlying cause. When omitted or empty, `message` uses a non-empty string
 * cause or `Error.message`, then falls back to `"An error occurred"`.
 *
 * **Example** (Wrapping user errors)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * import { CliError } from "effect/cli"
 *
 * // Wrapping user errors
 * const userError = new CliError.UserError({
 *   cause: new Error("Database connection failed for postgres://localhost"),
 *   userMessage: "Could not connect to the database"
 * })
 *
 * // In command handler
 * const deployCommand = Effect.gen(function*() {
 *   const result = yield* Effect.try({
 *     try: () => ({ deployed: true }),
 *     catch: (error) => new CliError.UserError({ cause: error })
 *   })
 *   return result
 * })
 *
 * // In error handling
 * const handleError = (error: CliError.CliError): Effect.Effect<number> => {
 *   if (error._tag === "UserError") {
 *     return Effect.succeed(1) // Exit code 1
 *   }
 *   return Effect.succeed(0)
 * }
 *
 * await Effect.runPromise(deployCommand) // => { deployed: true }
 * await Effect.runPromise(handleError(userError)) // => 1
 * ```
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class UserError extends Schema.TaggedError<UserError>(
  `${TypeId}/UserError`
)("UserError", {
  cause: Schema.Defect(),
  userMessage: Schema.optionalKey(Schema.String)
}) {
  /**
   * Marks this value as a user handler error for runtime guards.
   *
   * @stability unstable
   * @since 4.0.0
   */
  readonly [TypeId] = TypeId

  /**
   * Controls whether the runtime logger should report this error. The CLI
   * runner sets this to `false` after rendering the error itself.
   *
   * @stability unstable
   * @since 4.0.0
   */
  override [Runtime.errorReported] = true

  /**
   * Returns the explicit user-facing message or a safe fallback from `cause`.
   *
   * @stability unstable
   * @since 4.0.0
   */
  override get message() {
    if (this.userMessage) return this.userMessage
    if (typeof this.cause === "string" && this.cause) return this.cause
    if (this.cause instanceof Error && this.cause.message) return this.cause.message
    return "An error occurred"
  }
}

/**
 * Schema for concrete CLI errors that can be reported together with help output.
 *
 * **Details**
 *
 * This excludes `ShowHelp` itself, allowing parse and validation errors to be
 * stored in `ShowHelp.errors` without nesting another help-control value.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const NonShowHelpErrors: Schema.Union<
  readonly [
    typeof UnrecognizedOption,
    typeof DuplicateOption,
    typeof MissingOption,
    typeof MissingArgument,
    typeof UnexpectedArgument,
    typeof InvalidValue,
    typeof UnknownSubcommand,
    typeof UserError
  ]
> = Schema.Union([
  UnrecognizedOption,
  DuplicateOption,
  MissingOption,
  MissingArgument,
  UnexpectedArgument,
  InvalidValue,
  UnknownSubcommand,
  UserError
])

/**
 * Type of CLI errors that are not `ShowHelp`.
 *
 * **Details**
 *
 * These errors can be accumulated and attached to `ShowHelp.errors` when the
 * runner should display help along with the underlying parse or validation
 * failures.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export type NonShowHelpErrors = typeof NonShowHelpErrors.Type

/**
 * Error data requesting CLI help rendering for a command path.
 *
 * **Details**
 *
 * It is used for explicit help requests and for parse or validation failures
 * that should be shown with help text. When `errors` is non-empty, the runtime
 * exit code is `1`; otherwise it is `0`.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class ShowHelp extends Schema.TaggedError<ShowHelp>(
  `${TypeId}/ShowHelp`
)("ShowHelp", {
  commandPath: Schema.Array(Schema.String),
  errors: Schema.Array(NonShowHelpErrors)
}) {
  readonly [TypeId] = TypeId

  override readonly [Runtime.errorExitCode] = this.errors.length ? 1 : 0
  override readonly [Runtime.errorReported] = false

  override get message() {
    return "Help requested"
  }
}
