import { assert, describe, it } from "@effect/vitest"
import { Config, ConfigProvider, Effect, FileSystem, Layer, Option, Path, Ref, Result, Stdio } from "effect"
import { Argument, CliError, Command, Flag, Param, Primitive, Prompt } from "effect/cli"
import * as Lexer from "effect/cli/internal/lexer"
import * as Parser from "effect/cli/internal/parser"
import { ChildProcessSpawner } from "effect/process"
import { TestConsole } from "effect/testing"
import * as MockTerminal from "./services/MockTerminal.ts"

const ConsoleLayer = TestConsole.layer
const FileSystemLayer = FileSystem.layerNoop({})
const PathLayer = Path.layer
const TerminalLayer = MockTerminal.layer
const StdioLayer = Stdio.layerTest({})
const ChildProcessSpawnerLayer = Layer.succeed(
  ChildProcessSpawner.ChildProcessSpawner,
  ChildProcessSpawner.make(() => Effect.die("Not implemented"))
)

const TestLayer = Layer.mergeAll(
  ConsoleLayer,
  FileSystemLayer,
  PathLayer,
  TerminalLayer,
  StdioLayer,
  ChildProcessSpawnerLayer
)

describe("Param", () => {
  it.effect("Never remains an always-failing flag sentinel", () =>
    Effect.gen(function*() {
      for (const sentinel of [Flag.Never, Param.Never(Param.flagKind)]) {
        const missing = yield* Effect.flip(sentinel.parse({ flags: {}, arguments: [] }))
        assert.instanceOf(missing, CliError.MissingOption)
        const supplied = yield* Effect.flip(sentinel.parse({ flags: { __never__: ["value"] }, arguments: [] }))
        assert.instanceOf(supplied, CliError.InvalidValue)
      }
    }).pipe(Effect.provide(TestLayer)))

  it.effect("Never remains an always-failing argument sentinel", () =>
    Effect.gen(function*() {
      for (const sentinel of [Argument.Never, Param.Never(Param.argumentKind)]) {
        const missing = yield* Effect.flip(sentinel.parse({ flags: {}, arguments: [] }))
        assert.instanceOf(missing, CliError.MissingArgument)
        const supplied = yield* Effect.flip(sentinel.parse({ flags: {}, arguments: ["value"] }))
        assert.instanceOf(supplied, CliError.InvalidValue)
      }
    }).pipe(Effect.provide(TestLayer)))

  describe("boolean", () => {
    it.effect("returns MissingOption when a boolean flag is omitted", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          Flag.Boolean("verbose").parse({
            flags: {},
            arguments: []
          })
        )

        assert.instanceOf(error, CliError.MissingOption)
      }).pipe(Effect.provide(TestLayer)))

    it.effect("uses the requested default when a boolean flag is omitted", () =>
      Effect.gen(function*() {
        const flag = Flag.Boolean("verbose").pipe(Flag.withDefault(true))

        const [, value] = yield* flag.parse({
          flags: {},
          arguments: []
        })

        assert.isTrue(value)
      }).pipe(Effect.provide(TestLayer)))

    it.effect("restores switch behavior with a false default", () =>
      Effect.gen(function*() {
        const flag = Flag.Boolean("verbose").pipe(Flag.withDefault(false))

        const [, value] = yield* flag.parse({
          flags: {},
          arguments: []
        })

        assert.isFalse(value)
      }).pipe(Effect.provide(TestLayer)))
  })

  it.effect("recognizes the alternate flag declared by orElse", () =>
    Effect.gen(function*() {
      const command = Command.make("app", {
        config: Flag.String("config").pipe(
          Flag.orElse(() => Flag.String("config-url"))
        )
      })

      const parsed = yield* Parser.parseArgs(Lexer.lex(["--config-url", "https://example.com"]), command)

      assert.isUndefined(parsed.errors)
      assert.deepStrictEqual(parsed.flags["config-url"], ["https://example.com"])
    }).pipe(Effect.provide(TestLayer)))

  it.effect("registers and parses the alternate flag declared by orElseResult", () =>
    Effect.gen(function*() {
      const flag = Flag.String("config").pipe(
        Flag.orElseResult(() => Flag.String("config-url"))
      )

      assert.deepStrictEqual(Param.extractSingleParams(flag).map((param) => param.name), ["config", "config-url"])

      const [, result] = yield* flag.parse({
        flags: { "config-url": ["https://example.com"] },
        arguments: []
      })

      assert.deepStrictEqual(result, Result.fail("https://example.com"))
    }).pipe(Effect.provide(TestLayer)))

  it("preserves __proto__ as an own makeSingle option", () => {
    const value = { polluted: true }
    const param = Param.makeSingle({
      ["__proto__"]: value,
      kind: Param.flagKind,
      name: "name",
      primitiveType: Primitive.String
    } as any)

    assert.isTrue(Param.isParam(param))
    assert.isTrue(Object.hasOwn(param, "__proto__"))
    assert.strictEqual((param as any)["__proto__"], value)
  })

  describe("optional", () => {
    it.effect("returns none when an optional boolean flag is omitted", () =>
      Effect.gen(function*() {
        const flag = Flag.Boolean("verbose").pipe(Flag.optional)

        const [, value] = yield* flag.parse({
          flags: {},
          arguments: []
        })

        assert.deepStrictEqual(value, Option.none())
      }).pipe(Effect.provide(TestLayer)))

    it.effect("returns some false when an optional boolean flag is explicitly disabled", () =>
      Effect.gen(function*() {
        const flag = Flag.Boolean("verbose").pipe(Flag.optional)

        const [, value] = yield* flag.parse({
          flags: { verbose: ["false"] },
          arguments: []
        })

        assert.deepStrictEqual(value, Option.some(false))
      }).pipe(Effect.provide(TestLayer)))

    it.effect("supports alternative flags", () =>
      Effect.gen(function*() {
        const flag = Flag.String("config").pipe(
          Flag.orElse(() => Flag.String("config-url")),
          Flag.optional
        )

        const [, value] = yield* flag.parse({ flags: { config: ["config.json"] }, arguments: [] })

        assert.deepStrictEqual(value, Option.some("config.json"))
      }).pipe(Effect.provide(TestLayer)))
  })

  it.effect("uses the default when a required variadic argument is omitted", () =>
    Effect.gen(function*() {
      const argument = Argument.String("files").pipe(
        Argument.atLeast(1),
        Argument.withDefault(["README.md"])
      )

      const result = yield* argument.parse({ flags: {}, arguments: [] })

      assert.deepStrictEqual(result, [[], ["README.md"]])
    }).pipe(Effect.provide(TestLayer)))

  describe("withFallbackPrompt", () => {
    it.effect("prompts for missing flag values and preserves remaining args", () =>
      Effect.gen(function*() {
        const prompt = Prompt.String({ message: "Name" })
        const flag = Flag.String("name").pipe(Flag.withFallbackPrompt(prompt))

        yield* MockTerminal.inputText("Chandra")
        yield* MockTerminal.inputKey("enter")

        const [remaining, value] = yield* flag.parse({
          flags: {},
          arguments: ["tail"]
        })

        assert.strictEqual(value, "Chandra")
        assert.deepStrictEqual(remaining, ["tail"])
      }).pipe(Effect.provide(TestLayer)))

    it.effect("does not prompt when flag value is provided", () =>
      Effect.gen(function*() {
        const prompt = Prompt.String({ message: "Name" })
        const flag = Flag.String("name").pipe(Flag.withFallbackPrompt(prompt))

        const [, value] = yield* flag.parse({
          flags: { name: ["Ava"] },
          arguments: []
        })

        assert.strictEqual(value, "Ava")
      }).pipe(Effect.provide(TestLayer)))

    it.effect("prompts for missing arguments", () =>
      Effect.gen(function*() {
        const prompt = Prompt.String({ message: "File" })
        const argument = Argument.String("file").pipe(Argument.withFallbackPrompt(prompt))

        yield* MockTerminal.inputText("notes.txt")
        yield* MockTerminal.inputKey("enter")

        const [remaining, value] = yield* argument.parse({
          flags: {},
          arguments: []
        })

        assert.strictEqual(value, "notes.txt")
        assert.deepStrictEqual(remaining, [])
      }).pipe(Effect.provide(TestLayer)))

    it.effect("builds flag fallback prompts from effects lazily", () =>
      Effect.gen(function*() {
        const calls = yield* Ref.make(0)
        const prompt = Effect.gen(function*() {
          yield* Ref.update(calls, (n) => n + 1)
          return Prompt.String({ message: "Name from effect" })
        })

        const flag = Flag.String("name").pipe(Flag.withFallbackPrompt(prompt))

        const [, provided] = yield* flag.parse({
          flags: { name: ["Ava"] },
          arguments: []
        })
        assert.strictEqual(provided, "Ava")
        assert.strictEqual(yield* Ref.get(calls), 0)

        yield* MockTerminal.inputText("Mia")
        yield* MockTerminal.inputKey("enter")

        const [remaining, prompted] = yield* flag.parse({
          flags: {},
          arguments: ["tail"]
        })

        assert.strictEqual(prompted, "Mia")
        assert.deepStrictEqual(remaining, ["tail"])
        assert.strictEqual(yield* Ref.get(calls), 1)
      }).pipe(Effect.provide(TestLayer)))

    it.effect("builds argument fallback prompts from effects lazily", () =>
      Effect.gen(function*() {
        const calls = yield* Ref.make(0)
        const prompt = Effect.gen(function*() {
          yield* Ref.update(calls, (n) => n + 1)
          return Prompt.String({ message: "File from effect" })
        })

        const argument = Argument.String("file").pipe(Argument.withFallbackPrompt(prompt))

        const [providedRemaining, provided] = yield* argument.parse({
          flags: {},
          arguments: ["notes.txt", "tail"]
        })
        assert.strictEqual(provided, "notes.txt")
        assert.deepStrictEqual(providedRemaining, ["tail"])
        assert.strictEqual(yield* Ref.get(calls), 0)

        yield* MockTerminal.inputText("draft.md")
        yield* MockTerminal.inputKey("enter")

        const [promptedRemaining, prompted] = yield* argument.parse({
          flags: {},
          arguments: []
        })

        assert.strictEqual(prompted, "draft.md")
        assert.deepStrictEqual(promptedRemaining, [])
        assert.strictEqual(yield* Ref.get(calls), 1)
      }).pipe(Effect.provide(TestLayer)))

    it.effect("propagates errors from effectful fallback prompt creation", () =>
      Effect.gen(function*() {
        const failure = new CliError.UserError({
          cause: "failed to build prompt"
        })
        const prompt = Effect.fail(failure)

        const flag = Flag.String("name").pipe(Flag.withFallbackPrompt(prompt))

        const error = yield* Effect.flip(
          flag.parse({
            flags: {},
            arguments: []
          })
        )

        assert.strictEqual(error, failure)
      }).pipe(Effect.provide(TestLayer)))

    it.effect("prefers defaults over fallback prompts", () =>
      Effect.gen(function*() {
        const prompt = Prompt.String({ message: "Name" })
        const flag = Flag.String("name").pipe(
          Flag.withDefault("guest"),
          Flag.withFallbackPrompt(prompt)
        )

        const [, value] = yield* flag.parse({
          flags: {},
          arguments: []
        })

        assert.strictEqual(value, "guest")
      }).pipe(Effect.provide(TestLayer)))

    it.effect("does not prompt for invalid flag values", () =>
      Effect.gen(function*() {
        const prompt = Prompt.String({ message: "Count" })
        const flag = Flag.Int("count").pipe(Flag.withFallbackPrompt(prompt))

        const error = yield* Effect.flip(
          flag.parse({
            flags: { count: ["nope"] },
            arguments: []
          })
        )

        assert.instanceOf(error, CliError.InvalidValue)
      }).pipe(Effect.provide(TestLayer)))

    it.effect("does not prompt for invalid argument values", () =>
      Effect.gen(function*() {
        const prompt = Prompt.String({ message: "Count" })
        const argument = Argument.Int("count").pipe(Argument.withFallbackPrompt(prompt))

        const error = yield* Effect.flip(
          argument.parse({
            flags: {},
            arguments: ["nope"]
          })
        )

        assert.instanceOf(error, CliError.InvalidValue)
      }).pipe(Effect.provide(TestLayer)))

    it.effect("prompts for missing boolean flags", () =>
      Effect.gen(function*() {
        const prompt = Prompt.Confirm({ message: "Verbose" })
        const flag = Flag.Boolean("verbose").pipe(Flag.withFallbackPrompt(prompt))

        yield* MockTerminal.inputKey("y")

        const [, value] = yield* flag.parse({
          flags: {},
          arguments: []
        })

        assert.isTrue(value)
      }).pipe(Effect.provide(TestLayer)))

    it.effect("uses an explicitly disabled boolean before prompting", () =>
      Effect.gen(function*() {
        const prompt = Prompt.Confirm({ message: "Verbose" })
        const flag = Flag.Boolean("verbose").pipe(Flag.withFallbackPrompt(prompt))

        const [, value] = yield* flag.parse({
          flags: { verbose: ["false"] },
          arguments: []
        })

        assert.isFalse(value)
      }).pipe(Effect.provide(TestLayer)))

    it.effect("returns MissingOption when prompt is cancelled", () =>
      Effect.gen(function*() {
        const prompt = Prompt.String({ message: "Name" })
        const flag = Flag.String("name").pipe(Flag.withFallbackPrompt(prompt))

        yield* MockTerminal.inputKey("c", { ctrl: true })

        const error = yield* Effect.flip(
          flag.parse({
            flags: {},
            arguments: []
          })
        )

        assert.instanceOf(error, CliError.MissingOption)
      }).pipe(Effect.provide(TestLayer)))

    it.effect("returns MissingArgument when argument prompt is cancelled", () =>
      Effect.gen(function*() {
        const prompt = Prompt.String({ message: "File" })
        const argument = Argument.String("file").pipe(Argument.withFallbackPrompt(prompt))

        yield* MockTerminal.inputKey("c", { ctrl: true })

        const error = yield* Effect.flip(
          argument.parse({
            flags: {},
            arguments: []
          })
        )

        assert.instanceOf(error, CliError.MissingArgument)
      }).pipe(Effect.provide(TestLayer)))
  })

  describe("withFallbackConfig", () => {
    it.effect("uses ConfigProvider when a boolean flag is missing", () => {
      const provider = ConfigProvider.fromEnv({
        env: {
          VERBOSE: "true"
        }
      })

      return Effect.gen(function*() {
        const flag = Flag.Boolean("verbose").pipe(
          Flag.withFallbackConfig(Config.Boolean("VERBOSE"))
        )

        const [, value] = yield* flag.parse({
          flags: {},
          arguments: []
        })

        assert.isTrue(value)
      }).pipe(
        Effect.provideService(ConfigProvider.ConfigProvider, provider),
        Effect.provide(TestLayer)
      )
    })

    it.effect("uses an explicitly disabled boolean before reading config fallbacks", () => {
      const provider = ConfigProvider.fromEnv({
        env: {
          VERBOSE: "true"
        }
      })

      return Effect.gen(function*() {
        const flag = Flag.Boolean("verbose").pipe(
          Flag.withFallbackConfig(Config.Boolean("VERBOSE"))
        )

        const [, value] = yield* flag.parse({
          flags: { verbose: ["false"] },
          arguments: []
        })

        assert.isFalse(value)
      }).pipe(
        Effect.provideService(ConfigProvider.ConfigProvider, provider),
        Effect.provide(TestLayer)
      )
    })

    it.effect("uses ConfigProvider when a flag is missing", () => {
      const provider = ConfigProvider.fromEnv({
        env: {
          NAME: "Ava"
        }
      })

      return Effect.gen(function*() {
        const flag = Flag.String("name").pipe(
          Flag.withFallbackConfig(Config.String("NAME"))
        )

        const [, value] = yield* flag.parse({
          flags: {},
          arguments: []
        })

        assert.strictEqual(value, "Ava")
      }).pipe(
        Effect.provideService(ConfigProvider.ConfigProvider, provider),
        Effect.provide(TestLayer)
      )
    })

    it.effect("uses flag values before reading config fallbacks", () => {
      const provider = ConfigProvider.fromEnv({
        env: {
          NAME: "Ava"
        }
      })

      return Effect.gen(function*() {
        const flag = Flag.String("name").pipe(
          Flag.withFallbackConfig(Config.String("NAME"))
        )

        const [, value] = yield* flag.parse({
          flags: { name: ["Maya"] },
          arguments: []
        })

        assert.strictEqual(value, "Maya")
      }).pipe(
        Effect.provideService(ConfigProvider.ConfigProvider, provider),
        Effect.provide(TestLayer)
      )
    })

    it.effect("uses ConfigProvider when an argument is missing", () => {
      const provider = ConfigProvider.fromEnv({
        env: {
          REPOSITORY: "repo"
        }
      })

      return Effect.gen(function*() {
        const argument = Argument.String("repository").pipe(
          Argument.withFallbackConfig(Config.String("REPOSITORY"))
        )

        const [, value] = yield* argument.parse({
          flags: {},
          arguments: []
        })

        assert.strictEqual(value, "repo")
      }).pipe(
        Effect.provideService(ConfigProvider.ConfigProvider, provider),
        Effect.provide(TestLayer)
      )
    })

    it.effect("returns MissingOption when config is missing", () => {
      const provider = ConfigProvider.fromEnv({ env: {} })

      return Effect.gen(function*() {
        const flag = Flag.String("name").pipe(
          Flag.withFallbackConfig(Config.String("NAME"))
        )

        const error = yield* Effect.flip(
          flag.parse({
            flags: {},
            arguments: []
          })
        )

        assert.instanceOf(error, CliError.MissingOption)
      }).pipe(
        Effect.provideService(ConfigProvider.ConfigProvider, provider),
        Effect.provide(TestLayer)
      )
    })

    it.effect("returns InvalidValue when config fails to parse", () => {
      const provider = ConfigProvider.fromEnv({
        env: {
          COUNT: "nope"
        }
      })

      return Effect.gen(function*() {
        const flag = Flag.Int("count").pipe(
          Flag.withFallbackConfig(Config.Int("COUNT"))
        )

        const error = yield* Effect.flip(
          flag.parse({
            flags: {},
            arguments: []
          })
        )

        assert.instanceOf(error, CliError.InvalidValue)
      }).pipe(
        Effect.provideService(ConfigProvider.ConfigProvider, provider),
        Effect.provide(TestLayer)
      )
    })
  })
})
