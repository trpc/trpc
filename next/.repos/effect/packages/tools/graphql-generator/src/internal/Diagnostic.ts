/**
 * Located diagnostics for the generator. Lexing and parsing stop at the first
 * error; validation collects multiple errors.
 *
 * @internal
 */
import * as Data from "effect/Data"
import * as Result from "effect/Result"

/** A GraphQL document together with the path diagnostics report it under. */
export interface Source {
  readonly path: string
  readonly body: string
}

/**
 * A located error in one GraphQL source file.
 *
 * Locations are 1-based UTF-16 columns; EOF points past the last character.
 * `message` excludes the location. `codeFrame` shows the line and its
 * neighbours with a caret under the offending column.
 */
export class Diagnostic extends Data.TaggedError("Diagnostic")<{
  readonly path: string
  readonly line: number
  readonly column: number
  readonly message: string
  readonly codeFrame: string
}> {}

interface Location {
  readonly line: number
  readonly column: number
}

const lineTerminator = /\r\n|\r|\n/g

/** The 1-based line and UTF-16 column of a code-unit offset into `body`. */
const locationOf = (body: string, offset: number): Location => {
  const lines = body.slice(0, offset).split(lineTerminator)
  return { line: lines.length, column: lines[lines.length - 1]!.length + 1 }
}

const codeFrame = (body: string, location: Location): string => {
  const lines = body.split(lineTerminator)
  const first = Math.max(1, location.line - 1)
  const last = Math.min(lines.length, location.line + 1)
  const width = String(last).length
  const out: Array<string> = []
  for (let n = first; n <= last; n++) {
    out.push(`${String(n).padStart(width)} | ${lines[n - 1] ?? ""}`)
    if (n === location.line) {
      out.push(`${" ".repeat(width)} | ${" ".repeat(location.column - 1)}^`)
    }
  }
  return out.join("\n")
}

/** Builds a diagnostic for `message` at a code-unit offset into the source. */
export const make = (source: Source, offset: number, message: string): Diagnostic => {
  const location = locationOf(source.body, offset)
  return new Diagnostic({
    path: source.path,
    line: location.line,
    column: location.column,
    message,
    codeFrame: codeFrame(source.body, location)
  })
}

/** Runs `body`, turning a thrown {@link Diagnostic} into a failure. Other errors propagate. */
export const catchDiagnostic = <A>(body: () => A): Result.Result<A, Diagnostic> => {
  try {
    return Result.succeed(body())
  } catch (error) {
    if (error instanceof Diagnostic) return Result.fail(error)
    throw error
  }
}
