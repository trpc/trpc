/**
 * The lexer module converts raw command-line arguments into the token stream
 * consumed by the unstable CLI parser. It recognizes long options
 * (`--name` / `--name=value`), short options (`-x`), clustered short options
 * (`-abc`), option values supplied with `=`, and positional values.
 *
 * The `--` delimiter is handled before tokenization: everything after it is
 * returned as trailing operands so values that look like options are preserved
 * exactly. A lone `-` is also preserved as a value instead of being interpreted
 * as an option, as are negative numbers such as `-3` or `-3.70`.
 */
/**
 * @internal
 */
export type Token =
  | { _tag: "LongOption"; name: string; raw: string; value?: string }
  | { _tag: "ShortOption"; flag: string; raw: string; value?: string }
  | { _tag: "Value"; value: string }

/**
 * @internal
 */
export interface LexResult {
  readonly tokens: ReadonlyArray<Token>
  readonly trailingOperands: ReadonlyArray<string>
}

/**
 * @internal
 */
export function lex(argv: ReadonlyArray<string>): LexResult {
  const endIndex = argv.indexOf("--")

  if (endIndex === -1) {
    // No -- delimiter, lex everything normally
    return {
      tokens: lexTokens(argv),
      trailingOperands: []
    }
  }

  // Split at -- delimiter
  return {
    tokens: lexTokens(argv.slice(0, endIndex)),
    trailingOperands: argv.slice(endIndex + 1)
  }
}

const negativeNumberRegex = /^-(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/

const lexTokens = (args: ReadonlyArray<string>): ReadonlyArray<Token> => {
  const tokens: Array<Token> = []

  for (const arg of args) {
    if (!arg.startsWith("-") || negativeNumberRegex.test(arg)) {
      tokens.push({ _tag: "Value", value: arg })
    } else if (arg.startsWith("--")) {
      const equalIndex = arg.indexOf("=")
      if (equalIndex !== -1) {
        const name = arg.slice(2, equalIndex)
        const value = arg.slice(equalIndex + 1)
        tokens.push({ _tag: "LongOption", name, raw: arg, value })
      } else {
        tokens.push({ _tag: "LongOption", name: arg.slice(2), raw: arg })
      }
    } else if (arg.length > 1) {
      const flags = arg.slice(1)
      const equalIndex = flags.indexOf("=")
      if (equalIndex !== -1) {
        const flag = flags.slice(0, equalIndex)
        const value = flags.slice(equalIndex + 1)
        tokens.push({ _tag: "ShortOption", flag, raw: `-${flag}`, value })
      } else {
        for (const ch of flags) {
          tokens.push({ _tag: "ShortOption", flag: ch, raw: `-${ch}` })
        }
      }
    } else {
      tokens.push({ _tag: "Value", value: arg })
    }
  }

  return tokens
}
