/**
 * Detection of whether a CLI can color, animate, or prompt.
 *
 * The default reads `NO_COLOR`, `FORCE_COLOR`, `TERM`, and the TTY state of
 * the current process. The layer reads the same variables through
 * `ConfigProvider`, plus the TTY state of `Stdio`. Unless a
 * `CliOutput.Formatter` is provided, the built-in help, version, and error
 * output of `Command` follows `canColor`. Fallback prompts added with
 * `Flag.withFallbackPrompt` or `Argument.withFallbackPrompt` only run when
 * `canPrompt` is `true`.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Config from "../Config.ts"
import * as Context from "../Context.ts"
import * as Effect from "../Effect.ts"
import * as Layer from "../Layer.ts"
import * as Option from "../Option.ts"
import * as Stdio from "../Stdio.ts"

/**
 * Terminal rendering flags for the current process.
 *
 * **Details**
 *
 * `canColor` says whether styling will be rendered rather than stored as
 * bytes. `canAnimate` says whether output is being watched, so pacing means
 * something. `canPrompt` says whether a question can be asked and answered.
 * The built-in `Command` output reads `canColor`, and fallback prompts for
 * missing flags and arguments are skipped when `canPrompt` is `false`.
 * `canAnimate` is for application code that renders its own output.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface TerminalCapabilities {
  readonly canColor: boolean
  readonly canAnimate: boolean
  readonly canPrompt: boolean
}

/**
 * Reference to the terminal capabilities of the current process.
 *
 * **When to use**
 *
 * Use when application output should share the built-in help, version, and
 * error output's answer. Provide `layer` to detect through
 * `ConfigProvider` and `Stdio`, or provide a value to override detection.
 *
 * **Details**
 *
 * The default is detected from the current process the first time it is
 * read, so later changes to the environment do not affect it. Without a
 * `process` global, every flag is `false`.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const TerminalCapabilities: Context.Reference<TerminalCapabilities> = Context.Reference(
  "effect/cli/TerminalCapabilities",
  { defaultValue: () => fromProcess() }
)

const isPresent = (value: string | undefined): value is string => value !== undefined && value.length > 0

const isForcingColor = (value: string | undefined): boolean =>
  isPresent(value) && value !== "0" && value.toLowerCase() !== "false"

const detect = (input: {
  readonly noColor: string | undefined
  readonly forceColor: string | undefined
  readonly term: string | undefined
  readonly stdinIsTerminal: boolean
  readonly stdoutIsTerminal: boolean
}): TerminalCapabilities => {
  if (input.term === "dumb") {
    return { canColor: false, canAnimate: false, canPrompt: false }
  }

  return {
    canColor: !isPresent(input.noColor) && (isForcingColor(input.forceColor) || input.stdoutIsTerminal),
    canAnimate: input.stdoutIsTerminal,
    canPrompt: input.stdinIsTerminal && input.stdoutIsTerminal
  }
}

const fromProcess = (): TerminalCapabilities => {
  const process = (globalThis as any).process
  return detect({
    noColor: process?.env?.NO_COLOR,
    forceColor: process?.env?.FORCE_COLOR,
    term: process?.env?.TERM,
    stdinIsTerminal: process?.stdin?.isTTY === true,
    stdoutIsTerminal: process?.stdout?.isTTY === true
  })
}

const environment = Config.all({
  noColor: Config.option(Config.String("NO_COLOR")),
  forceColor: Config.option(Config.String("FORCE_COLOR")),
  term: Config.option(Config.String("TERM"))
})

/**
 * Detects terminal capabilities from `Stdio` and the current `ConfigProvider`.
 *
 * **Details**
 *
 * `TERM=dumb` clears all three flags, because a terminal that cannot move the
 * cursor can neither animate nor redraw a prompt. Otherwise `NO_COLOR`, when
 * set to any non-empty value, disables color and wins over `FORCE_COLOR`.
 * `FORCE_COLOR` forces color even off a TTY, except for `0` and `false`, which
 * mean "not forcing". Empty variables count as unset, matching
 * `ConfigProvider.fromEnv`, so `FORCE_COLOR=` does not force color on.
 * `canPrompt` requires both standard input and standard output to be
 * terminals. A `ConfigProvider` fault is a defect, so the layer never fails.
 *
 * **Example** (NO_COLOR wins over FORCE_COLOR)
 *
 * ```ts import.meta.vitest
 * import { ConfigProvider, Effect, Stdio } from "effect"
 * import { TerminalCapabilities } from "effect/cli"
 *
 * const program = Effect.gen(function*() {
 *   const caps = yield* TerminalCapabilities.TerminalCapabilities
 *   return caps.canColor
 * }).pipe(
 *   Effect.provide(TerminalCapabilities.layer),
 *   Effect.provide(Stdio.layerTest({ stdoutIsTerminal: Effect.succeed(true) })),
 *   Effect.provideService(
 *     ConfigProvider.ConfigProvider,
 *     ConfigProvider.fromEnv({ env: { NO_COLOR: "1", FORCE_COLOR: "1" } })
 *   )
 * )
 *
 * Effect.runSync(program) // => false
 * ```
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer: Layer.Layer<never, never, Stdio.Stdio> = Layer.effect(
  TerminalCapabilities
)(Effect.gen(function*() {
  const stdio = yield* Stdio.Stdio
  const env = yield* Effect.orDie(environment)
  return detect({
    noColor: Option.getOrUndefined(env.noColor),
    forceColor: Option.getOrUndefined(env.forceColor),
    term: Option.getOrUndefined(env.term),
    stdinIsTerminal: yield* stdio.stdinIsTerminal,
    stdoutIsTerminal: yield* stdio.stdoutIsTerminal
  })
}))
