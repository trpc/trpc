/**
 * Builds command lines, the single strings that a shell or a Windows program
 * turns back into arguments, and argument lists from templates. It is
 * unrelated to `effect/cli`, which parses the arguments of your own program.
 *
 * The rules depend on what parses the string, not on the platform that builds
 * it, so `quote`, `join` and `display` take an explicit `format`:
 *
 * - `"posix"` (the default) for `sh`, `dash`, `bash` and `zsh`. Quoted output
 *   is also read the same way by `fish`.
 * - `"powershell"` for PowerShell 7.3 or later.
 * - `"windows"` for the Microsoft C runtime rules that most Windows programs
 *   use to split their command line.
 *
 * SSH sends one command line to the login shell of the remote account, so the
 * format must match that shell. The remote shell must be a POSIX shell or
 * PowerShell: Windows OpenSSH uses `cmd.exe` by default, which no format
 * supports, so set its `DefaultShell` to PowerShell. Docker and Kubernetes exec
 * take argument lists and need no command line at all.
 *
 * Arguments can be `Redacted` strings. `quote` and `join` include their values,
 * because their output is meant to run, while `display` replaces them with
 * `<redacted>`.
 *
 * @stability unstable
 * @since 4.0.7
 */
import * as Data from "../Data.ts"
import * as Redacted from "../Redacted.ts"
import * as Result from "../Result.ts"

/**
 * Command line syntax understood by the functions in this module.
 *
 * **Details**
 *
 * - `"posix"`: POSIX shells (`sh`, `dash`, `bash`, `zsh`). Quoted words are
 *   also safe in `fish`.
 * - `"powershell"`: PowerShell 7.3 or later, which passes arguments to native
 *   programs unchanged (`$PSNativeCommandArgumentPassing` set to `Standard` or
 *   `Windows`).
 * - `"windows"`: the Microsoft C runtime convention, also implemented by
 *   `CommandLineToArgvW`, that most Windows programs use. It is not the syntax
 *   of `cmd.exe` or of batch files.
 *
 * @stability unstable
 * @category models
 * @since 4.0.7
 */
export type Format = "posix" | "powershell" | "windows"

/**
 * One argument: a plain string or a `Redacted` string that must not appear in
 * logs.
 *
 * @stability unstable
 * @category models
 * @since 4.0.7
 */
export type Word = string | Redacted.Redacted<string>

/**
 * Single value accepted inside a `${}` interpolation of {@link template}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.7
 */
export type TemplateExpressionItem = string | number | boolean | Redacted.Redacted<string>

/**
 * Value accepted inside a `${}` interpolation of {@link template}.
 *
 * **Details**
 *
 * An array adds one argument per element and must stand alone as a whole
 * argument. An empty array adds no arguments.
 *
 * @stability unstable
 * @category models
 * @since 4.0.7
 */
export type TemplateExpression = TemplateExpressionItem | ReadonlyArray<TemplateExpressionItem>

/**
 * Error returned when a command line or a template cannot be built.
 *
 * **Details**
 *
 * - `NulCharacter`: an argument passed to {@link quote} or {@link join}
 *   contains a NUL character, which no command line can carry.
 * - `InvalidArgument`: the format cannot carry an argument: a Windows program
 *   name with a double quote, or the argument `--%`, which PowerShell drops
 *   when it calls a native program.
 * - `InvalidEscape`: template text ends with a backslash that escapes nothing,
 *   or contains an invalid JavaScript escape sequence.
 * - `UnterminatedQuote`: a quoted section of a template is not closed.
 * - `UnsupportedSyntax`: template text contains shell syntax that cannot work
 *   without a shell, such as operators, expansions, globs, comments or
 *   variable assignments, or an interpolated array is not a separate argument.
 *
 * Messages never include the input, which may contain secrets.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.7
 */
export class CommandLineError extends Data.TaggedError("CommandLineError")<{
  readonly reason: "NulCharacter" | "InvalidArgument" | "InvalidEscape" | "UnterminatedQuote" | "UnsupportedSyntax"
  readonly message: string
}> {}

/**
 * Quotes one argument so that a program reading the given format sees it as
 * exactly one argument, with one PowerShell exception listed under Gotchas.
 *
 * **When to use**
 *
 * Use when you insert an argument into a command line that is otherwise
 * written by hand, for example a script passed to `sh -c`.
 *
 * **Details**
 *
 * - `"posix"` leaves words made of letters, digits and `_ @ + : , . / -`
 *   unchanged and wraps everything else in single quotes. Single quotes and
 *   backslashes are written outside the quotes, so `fish` reads the result
 *   the same way.
 * - `"powershell"` always uses single quotes, doubling `'` and the
 *   typographic single quotes that PowerShell also accepts as quotes.
 * - `"windows"` quotes words that contain a space, a tab, a line break or a
 *   double quote, using the C runtime backslash rules. Use {@link join} for a
 *   complete command line, because the program name follows different rules.
 *
 * **Gotchas**
 *
 * - The result contains the value of a `Redacted` argument. Use
 *   {@link display} for logs.
 * - Control characters are kept as they are. That is safe for `sh -c` and SSH
 *   commands, but not for text typed into an interactive shell.
 * - PowerShell never passes an argument equal to `--%` to a native program,
 *   however it is quoted. Use {@link join} for a whole native call, which
 *   fails with `InvalidArgument` instead.
 *
 * **Example** (Quoting arguments for different shells)
 *
 * ```ts import.meta.vitest
 * import { Result } from "effect"
 * import { CommandLine } from "effect/process"
 *
 * CommandLine.quote("it's") // => Result.succeed("'it'\\''s'")
 * CommandLine.quote("it's", { format: "powershell" }) // => Result.succeed("'it''s'")
 * CommandLine.quote("C:\\My Files\\", { format: "windows" }) // => Result.succeed("\"C:\\My Files\\\\\"")
 * ```
 *
 * @see {@link join} for quoting a whole argument list
 *
 * @stability unstable
 * @category encoding
 * @since 4.0.7
 */
export const quote = (
  word: Word,
  options?: { readonly format?: Format | undefined }
): Result.Result<string, CommandLineError> => {
  const value = unwrap(word)
  if (value.includes("\0")) return failNul("The argument")
  return Result.succeed(quoteWord(options?.format ?? "posix", value, false))
}

/**
 * Builds a command line that runs the given program and arguments.
 *
 * **When to use**
 *
 * Use when a transport accepts only one string, such as an SSH exec request or
 * a `shell` option, and the arguments must reach the program unchanged.
 *
 * **Details**
 *
 * The first word is the program. Each word is quoted as in {@link quote} and
 * the words are separated by spaces.
 *
 * - `"posix"` also quotes a program name that `sh`, `bash`, `zsh` or `fish`
 *   reads as syntax, such as `if` or `time`.
 * - `"powershell"` starts the line with the call operator `&`, because a
 *   quoted program name is otherwise read as a string value.
 * - `"windows"` quotes the program name with the C runtime rules for program
 *   names, which do not support backslash escapes.
 * - An empty list returns an empty string.
 *
 * **Gotchas**
 *
 * - The result contains the values of `Redacted` arguments. Use
 *   {@link display} for logs.
 * - A Windows program name that contains `"` fails with `InvalidArgument`.
 * - For `"powershell"`, an argument equal to `--%` fails with
 *   `InvalidArgument`: PowerShell drops it when it calls a native program,
 *   however it is quoted.
 * - `"windows"` output is the command line of a program, not a `cmd.exe`
 *   script. `cmd.exe`, which `shell: true` uses on Windows, expands `%NAME%`
 *   and reads `^ & | < >` before the program sees its arguments, so a script
 *   that contains untrusted values has to be written by hand.
 *
 * **Example** (Joining arguments into command lines)
 *
 * ```ts import.meta.vitest
 * import { Result } from "effect"
 * import { CommandLine } from "effect/process"
 *
 * const args = ["git", "commit", "-m", "fix: don't fail"]
 *
 * CommandLine.join(args) // => Result.succeed("git commit -m 'fix: don'\\''t fail'")
 * CommandLine.join(args, { format: "powershell" }) // => Result.succeed("& 'git' 'commit' '-m' 'fix: don''t fail'")
 * CommandLine.join(args, { format: "windows" }) // => Result.succeed("git commit -m \"fix: don't fail\"")
 * ```
 *
 * @see {@link display} for rendering a command for logs and error messages
 *
 * @stability unstable
 * @category encoding
 * @since 4.0.7
 */
export const join = (
  words: ReadonlyArray<Word>,
  options?: { readonly format?: Format | undefined }
): Result.Result<string, CommandLineError> => {
  const values: Array<string> = []
  for (let i = 0; i < words.length; i++) {
    const value = unwrap(words[i])
    if (value.includes("\0")) return failNul(`Argument ${i}`)
    values.push(value)
  }
  if (values.length === 0) return Result.succeed("")
  const format = options?.format ?? "posix"
  if (format === "powershell") {
    const stopParsing = values.indexOf("--%", 1)
    if (stopParsing !== -1) {
      return Result.fail(
        new CommandLineError({
          reason: "InvalidArgument",
          message: `Argument ${stopParsing} is "--%", which PowerShell drops when it calls a program`
        })
      )
    }
  } else if (format === "windows" && values[0].includes("\"")) {
    return Result.fail(
      new CommandLineError({
        reason: "InvalidArgument",
        message: "A Windows program name cannot contain a double quote"
      })
    )
  }
  return Result.succeed(joinWords(format, values.map((value, i) => quoteWord(format, value, i === 0))))
}

/**
 * Renders a command for logs and error messages.
 *
 * **When to use**
 *
 * Use when you show a command to a person, for example in an error message,
 * and secrets and control characters must not reach the output.
 *
 * **Details**
 *
 * - Quotes like {@link join}, so commands without control characters or
 *   secrets can be copied into a terminal of the given format.
 * - Replaces `Redacted` arguments with `<redacted>`.
 * - Writes control characters and Unicode line separators as escapes such as
 *   `\n` or `\u001b`, so output cannot move the cursor or inject terminal
 *   sequences.
 * - Never fails: input that {@link join} rejects is rendered anyway.
 *
 * **Gotchas**
 *
 * The output is for reading only. It is not a reliable command line: escapes
 * and `<redacted>` change what a shell would run.
 *
 * **Example** (Showing a command with a secret)
 *
 * ```ts import.meta.vitest
 * import { Redacted } from "effect"
 * import { CommandLine } from "effect/process"
 *
 * const token = Redacted.make("hunter2")
 *
 * CommandLine.display(["curl", "-H", token, "https://x.dev/a b"]) // => "curl -H <redacted> 'https://x.dev/a b'"
 * ```
 *
 * @see {@link join} for building a command line to run
 *
 * @stability unstable
 * @category encoding
 * @since 4.0.7
 */
export const display = (words: ReadonlyArray<Word>, options?: { readonly format?: Format | undefined }): string => {
  if (words.length === 0) return ""
  const format = options?.format ?? "posix"
  // Escaping after quoting keeps the escapes inside the quotes.
  return joinWords(
    format,
    words.map((word, i) =>
      Redacted.isRedacted(word) ? "<redacted>" : escapeControlCharacters(quoteWord(format, word, i === 0))
    )
  )
}

/**
 * Builds an argument list from a template literal.
 *
 * **When to use**
 *
 * Use to write a command as it would look in a shell while keeping every
 * interpolated value a literal argument.
 *
 * **Details**
 *
 * - The template text is split into words as a POSIX shell does: spaces,
 *   tabs and line breaks separate words, and quotes and backslash escapes are
 *   removed. A long command can span several lines.
 * - Text that would need a shell fails with `UnsupportedSyntax`: operators
 *   (`| & ; < > ( )`), expansions (`$NAME`, `${...}`, `$(...)`, backticks, a
 *   leading `~`, braces such as `{a,b}`, and a leading `=` that `zsh`
 *   expands), globs (`* ? [`), comments (`#` at the start of a word), and a
 *   variable assignment in the program position. Quote such characters to
 *   pass them literally.
 * - No shell runs, so a program such as `if` or `time` names an executable.
 * - Each `${}` value is inserted literally, without splitting or quote
 *   processing. Next to other text or inside quotes, it becomes part of the
 *   surrounding argument.
 * - An array adds one argument per element and must stand alone as a whole
 *   argument.
 * - Numbers and booleans are converted with `String`.
 * - An argument that contains a `Redacted` value becomes `Redacted` as a
 *   whole.
 *
 * **Gotchas**
 *
 * - An invalid JavaScript escape sequence in the text, such as `\u` without
 *   hex digits, fails with `InvalidEscape`. Use `String.raw` or a `${}` value
 *   for backslashes.
 * - Neither the text nor the values are checked for NUL characters.
 *   {@link join} and the child process spawners reject them where they would
 *   truncate an argument.
 *
 * **Example** (Building arguments with interpolated values)
 *
 * ```ts import.meta.vitest
 * import { Redacted, Result } from "effect"
 * import { CommandLine } from "effect/process"
 *
 * const msg = "fix: handle $HOME"
 * const files = ["a.ts", "b.ts"]
 *
 * CommandLine.template`git commit -m ${msg} ${files}` // => Result.succeed(["git", "commit", "-m", msg, ...files])
 *
 * const password = Redacted.make("hunter2")
 * const words = Result.getOrThrow(CommandLine.template`psql "--password=${password}"`)
 *
 * CommandLine.display(words) // => "psql <redacted>"
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.7
 */
export const template = (
  strings: TemplateStringsArray,
  ...expressions: ReadonlyArray<TemplateExpression>
): Result.Result<Array<Word>, CommandLineError> => {
  const index = strings.findIndex((text) => text === undefined)
  if (index !== -1) {
    return Result.fail(
      new CommandLineError({
        reason: "InvalidEscape",
        message: `Template part ${index} contains an invalid escape sequence`
      })
    )
  }
  return parseTemplate(strings, expressions)
}

// -----------------------------------------------------------------------------
// Quoting
// -----------------------------------------------------------------------------

const unwrap = (item: TemplateExpressionItem): string =>
  Redacted.isRedacted(item) ? Redacted.value(item as Redacted.Redacted<string>) : String(item)

const toWord = (item: TemplateExpressionItem): Word =>
  Redacted.isRedacted(item) ? item as Redacted.Redacted<string> : String(item)

const failNul = (subject: string): Result.Result<never, CommandLineError> =>
  Result.fail(new CommandLineError({ reason: "NulCharacter", message: `${subject} contains a NUL character` }))

// Words that sh, bash, zsh or fish read as syntax in the program position. A
// quoted reserved word is an ordinary command name.
const reservedWords = new Set([
  "!",
  "{",
  "}",
  "and",
  "begin",
  "case",
  "coproc",
  "do",
  "done",
  "elif",
  "else",
  "end",
  "esac",
  "fi",
  "for",
  "foreach",
  "function",
  "if",
  "in",
  "nocorrect",
  "not",
  "or",
  "repeat",
  "select",
  "switch",
  "then",
  "time",
  "until",
  "while"
])

// Quotes one word for the format. The program, the first word, follows
// different rules from the arguments in POSIX shells and in Windows programs.
const quoteWord = (format: Format, value: string, program: boolean): string => {
  switch (format) {
    case "posix":
      return program && reservedWords.has(value) ? `'${value}'` : quotePosix(value)
    case "powershell":
      return quotePowerShell(value)
    case "windows":
      return program && !value.includes("\"") ? quoteWindowsProgram(value) : quoteWindowsArgument(value)
  }
}

const joinWords = (format: Format, quoted: ReadonlyArray<string>): string =>
  format === "powershell" ? `& ${quoted.join(" ")}` : quoted.join(" ")

const posixSafe = /^[A-Za-z0-9_@+:,./-]+$/

// Single quotes keep every character literal in POSIX shells. `'` and `\` are
// written outside the quotes, because fish also treats `\'` and `\\` as
// escapes inside single quotes.
const quotePosix = (value: string): string =>
  posixSafe.test(value) ? value : `'${value.replace(/['\\]/g, (char) => `'\\${char}'`)}'`

// PowerShell also reads the typographic single quotes U+2018 to U+201B as
// quotes, so each of them is doubled like `'`.
const quotePowerShell = (value: string): string => `'${value.replace(/['\u2018\u2019\u201A\u201B]/g, "$&$&")}'`

const windowsNeedsQuotes = /[ \t\n\v"]/

// Arguments: 2n backslashes before a quote mean n backslashes, 2n+1 mean n
// backslashes and a literal quote, and other backslashes are literal.
const quoteWindowsArgument = (value: string): string => {
  if (value.length > 0 && !windowsNeedsQuotes.test(value)) return value
  let out = "\""
  let backslashes = 0
  for (const char of value) {
    if (char === "\\") {
      backslashes++
    } else if (char === "\"") {
      out += "\\".repeat(backslashes * 2 + 1) + "\""
      backslashes = 0
    } else {
      out += "\\".repeat(backslashes) + char
      backslashes = 0
    }
  }
  return out + "\\".repeat(backslashes * 2) + "\""
}

// Program names allow quotes for grouping but no backslash escapes.
const quoteWindowsProgram = (value: string): string => value.length > 0 && !/[ \t]/.test(value) ? value : `"${value}"`

// oxlint-disable-next-line no-control-regex
const controlCharacters = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g

const controlEscapes: Record<string, string> = { "\n": "\\n", "\r": "\\r", "\t": "\\t" }

const escapeControlCharacters = (value: string): string =>
  value.replace(
    controlCharacters,
    (char) => controlEscapes[char] ?? `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`
  )

// -----------------------------------------------------------------------------
// Templates
// -----------------------------------------------------------------------------

const operators = "|&;<>()"
const globs = "*?["
const expansionStart = /[A-Za-z_0-9{(@*#?$!'"-]/
const quotedExpansionStart = /[A-Za-z_0-9{(@*#?$!-]/
const assignmentName = /^[A-Za-z_][A-Za-z0-9_]*\+?$/

const isBlank = (char: string | undefined): boolean => char === " " || char === "\t" || char === "\n"

// Why an unquoted character needs a shell, if it does.
const unsupportedSyntax = (char: string, next: string | undefined, wordStart: boolean): string | undefined => {
  if (operators.includes(char)) return `The operator "${char}" needs a shell`
  if (char === "`") return "Command substitution needs a shell"
  if (char === "$" && next !== undefined && expansionStart.test(next)) return `The expansion "$${next}" needs a shell`
  if (globs.includes(char)) return `The glob character "${char}" needs a shell`
  if (!wordStart) return undefined
  if (char === "#") return "A comment needs a shell"
  if (char === "~") return "Tilde expansion needs a shell"
  if (char === "=" && next !== undefined && !isBlank(next)) return "A leading \"=\" is expanded by zsh"
  return undefined
}

// Splits the text parts with POSIX quote removal and inserts the values
// between them.
const parseTemplate = (
  texts: ReadonlyArray<string>,
  values: ReadonlyArray<TemplateExpression>
): Result.Result<Array<Word>, CommandLineError> => {
  const words: Array<Word> = []
  // The current word, empty until it starts. An opened quote adds "".
  let word: Array<Word> = []
  // The current word is unquoted literal text, so it can be the name of a
  // variable assignment.
  let plain = true
  let braceDepth = 0
  let quote: "'" | "\"" | undefined = undefined
  let quotePart = 0
  let part = 0

  const error = (
    reason: CommandLineError["reason"],
    message: string,
    at = part
  ): Result.Result<never, CommandLineError> =>
    Result.fail(new CommandLineError({ reason, message: `${message} in template part ${at}` }))

  const endWord = (): void => {
    if (word.length === 0) return
    const value = word.map(unwrap).join("")
    words.push(
      word.length === 1 && Redacted.isRedacted(word[0])
        ? word[0]
        : word.some(Redacted.isRedacted)
        ? Redacted.make(value)
        : value
    )
    word = []
    plain = true
    braceDepth = 0
  }

  const scan = (text: string): Result.Result<never, CommandLineError> | undefined => {
    for (let i = 0; i < text.length; i++) {
      const char = text[i]
      const next = text[i + 1]
      if (quote === "'") {
        if (char === "'") quote = undefined
        else word.push(char)
      } else if (quote === "\"") {
        if (char === "\"") {
          quote = undefined
        } else if (char === "\\" && next !== undefined && "$`\"\\\n".includes(next)) {
          if (next !== "\n") word.push(next)
          i++
        } else if (char === "`") {
          return error("UnsupportedSyntax", "Command substitution needs a shell")
        } else if (char === "$" && next !== undefined && quotedExpansionStart.test(next)) {
          return error("UnsupportedSyntax", `The expansion "$${next}" needs a shell`)
        } else {
          word.push(char)
        }
      } else if (isBlank(char)) {
        endWord()
      } else if (char === "\\") {
        if (next === undefined) return error("InvalidEscape", "A trailing backslash escapes nothing")
        if (next !== "\n") {
          word.push(next)
          plain = false
        }
        i++
      } else if (char === "'" || char === "\"") {
        quote = char
        quotePart = part
        word.push("")
        plain = false
      } else {
        const unsupported = unsupportedSyntax(char, next, word.length === 0)
        if (unsupported !== undefined) return error("UnsupportedSyntax", unsupported)
        if (char === "{") {
          braceDepth++
        } else if (char === "}") {
          if (braceDepth > 0) braceDepth--
        } else if (braceDepth > 0 && (char === "," || (char === "." && next === "."))) {
          return error("UnsupportedSyntax", "Brace expansion needs a shell")
        } else if (char === "=" && words.length === 0 && plain && assignmentName.test(word.join(""))) {
          return error("UnsupportedSyntax", "A variable assignment needs a shell")
        }
        word.push(char)
      }
    }
    return undefined
  }

  for (; part < texts.length; part++) {
    const failure = scan(texts[part])
    if (failure !== undefined) return failure
    if (part === values.length) break
    const expression = values[part]
    if (Array.isArray(expression)) {
      // An array must stand alone: nothing may touch it on either side.
      const after = texts[part + 1][0]
      if (word.length > 0 || (after === undefined ? part + 1 < values.length : !isBlank(after))) {
        return error("UnsupportedSyntax", "An interpolated array must be a separate argument")
      }
      for (const item of expression as ReadonlyArray<TemplateExpressionItem>) words.push(toWord(item))
    } else {
      word.push(toWord(expression as TemplateExpressionItem))
      plain = false
    }
  }
  if (quote !== undefined) return error("UnterminatedQuote", "The quote is not closed", quotePart)
  endWord()
  return Result.succeed(words)
}
