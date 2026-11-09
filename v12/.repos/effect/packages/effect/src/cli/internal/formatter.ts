import * as Context from "../../Context.ts"
import * as Effect from "../../Effect.ts"
import * as CliOutput from "../CliOutput.ts"
import * as TerminalCapabilities from "../TerminalCapabilities.ts"

/**
 * The formatter for built-in command output. An installed `CliOutput.Formatter`
 * wins, otherwise the default formatter colors when `TerminalCapabilities`
 * says it can.
 *
 * @internal
 */
export const resolveFormatter: Effect.Effect<CliOutput.Formatter> = Effect.contextWith((context) =>
  Effect.succeed(
    Context.getOrUndefined(context, CliOutput.Formatter) ??
      CliOutput.defaultFormatter({ colors: Context.get(context, TerminalCapabilities.TerminalCapabilities).canColor })
  )
)
