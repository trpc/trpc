// @effect-diagnostics floatingEffect:skip-file
import { assert, describe, it } from "@effect/vitest"
import { Effect, FileSystem, Layer, Path, Runtime, Stdio } from "effect"
import { Argument, CliError, CliOutput, Command, Flag } from "effect/cli"
import { toImpl } from "effect/cli/internal/command"
import * as Lexer from "effect/cli/internal/lexer"
import * as Parser from "effect/cli/internal/parser"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import * as MockTerminal from "./services/MockTerminal.ts"

const FileSystemLayer = FileSystem.layerNoop({})
const PathLayer = Path.layer
const TerminalLayer = MockTerminal.layer
const SpawnerLayer = Layer.succeed(
  ChildProcessSpawner.ChildProcessSpawner,
  ChildProcessSpawner.make(() => Effect.die("Not implemented"))
)

const TestLayer = Layer.mergeAll(
  FileSystemLayer,
  PathLayer,
  TerminalLayer,
  SpawnerLayer,
  Stdio.layerTest({})
)

describe("Command errors", () => {
  it("uses the UnknownSubcommand class name as its runtime tag", () => {
    const error = new CliError.UnknownSubcommand({
      subcommand: "deplyo",
      suggestions: ["deploy"]
    })

    assert.strictEqual(error._tag as string, "UnknownSubcommand")
  })

  describe("parse", () => {
    it.effect("fails with MissingOption when a required flag is absent", () =>
      Effect.gen(function*() {
        const command = Command.make("needs-value", {
          value: Flag.String("value")
        })

        const parsedInput = yield* Parser.parseArgs(Lexer.lex([]), command)
        const error = yield* Effect.flip(toImpl(command).parse(parsedInput))
        assert.instanceOf(error, CliError.MissingOption)
        assert.strictEqual(error.option, "value")
      }).pipe(Effect.provide(TestLayer)))

    it("throws DuplicateOption when shared parent and child flags reuse a name", () => {
      const parent = Command.make("parent").pipe(
        Command.withSharedFlags({
          shared: Flag.String("shared")
        })
      )

      const child = Command.make("child", {
        shared: Flag.String("shared")
      })

      try {
        parent.pipe(Command.withSubcommands([child]))
        assert.fail("expected DuplicateOption to be thrown")
      } catch (error) {
        assert.instanceOf(error, CliError.DuplicateOption)
        const duplicate = error as CliError.DuplicateOption
        assert.strictEqual(duplicate.option, "shared")
        assert.strictEqual(duplicate.parentCommand, "parent")
        assert.strictEqual(duplicate.childCommand, "child")
      }
    })

    it("allows parent local flags to reuse child flag names", () => {
      const parent = Command.make("parent", {
        shared: Flag.String("shared")
      })

      const child = Command.make("child", {
        shared: Flag.String("shared")
      })

      try {
        parent.pipe(Command.withSubcommands([child]))
      } catch (error) {
        assert.fail(`did not expect DuplicateOption: ${String(error)}`)
      }
    })

    it.effect("accumulates multiple UnrecognizedOption errors", () =>
      Effect.gen(function*() {
        const command = Command.make("test", {
          verbose: Flag.Boolean("verbose")
        })

        const parsedInput = yield* Parser.parseArgs(
          Lexer.lex(["--unknown1", "--unknown2"]),
          command
        )

        assert.isDefined(parsedInput.errors)
        assert.strictEqual(parsedInput.errors!.length, 2)
        assert.instanceOf(parsedInput.errors![0], CliError.UnrecognizedOption)
        assert.instanceOf(parsedInput.errors![1], CliError.UnrecognizedOption)
      }).pipe(Effect.provide(TestLayer)))

    it.effect("accumulates UnknownSubcommand error with suggestions", () =>
      Effect.gen(function*() {
        const sub = Command.make("deploy")
        const command = Command.make("app").pipe(
          Command.withSubcommands([sub])
        )

        const parsedInput = yield* Parser.parseArgs(
          Lexer.lex(["deplyo"]),
          command
        )

        assert.isDefined(parsedInput.errors)
        assert.strictEqual(parsedInput.errors!.length, 1)
        assert.instanceOf(parsedInput.errors![0], CliError.UnknownSubcommand)

        const error = parsedInput.errors![0] as CliError.UnknownSubcommand
        assert.strictEqual(error.subcommand, "deplyo")
        assert.isTrue(error.suggestions.includes("deploy"))
      }).pipe(Effect.provide(TestLayer)))

    it.effect("fails with UnexpectedArgument when a bounded variadic leaves operands", () =>
      Effect.gen(function*() {
        const command = Command.make("test", {
          values: Argument.String("value").pipe(Argument.variadic({ max: 2 }))
        })

        const parsedInput = yield* Parser.parseArgs(
          Lexer.lex(["one", "two", "three"]),
          command
        )
        const error = yield* Effect.flip(toImpl(command).parse(parsedInput))

        assert.instanceOf(error, CliError.UnexpectedArgument)
        assert.deepStrictEqual(error.arguments, ["three"])
      }).pipe(Effect.provide(TestLayer)))

    it.effect("allows a bounded variadic to leave an operand for a following argument", () =>
      Effect.gen(function*() {
        const command = Command.make("test", {
          values: Argument.String("value").pipe(Argument.variadic({ max: 2 })),
          destination: Argument.String("destination")
        })

        const parsedInput = yield* Parser.parseArgs(
          Lexer.lex(["one", "two", "destination"]),
          command
        )
        const result = yield* toImpl(command).parse(parsedInput)

        assert.deepStrictEqual(result, {
          values: ["one", "two"],
          destination: "destination"
        })
      }).pipe(Effect.provide(TestLayer)))

    it.effect("fails with UnexpectedArgument when a fixed argument leaves operands", () =>
      Effect.gen(function*() {
        const command = Command.make("test", {
          value: Argument.String("value")
        })

        const parsedInput = yield* Parser.parseArgs(
          Lexer.lex(["one", "two"]),
          command
        )
        const error = yield* Effect.flip(toImpl(command).parse(parsedInput))

        assert.instanceOf(error, CliError.UnexpectedArgument)
        assert.deepStrictEqual(error.arguments, ["two"])
      }).pipe(Effect.provide(TestLayer)))
  })

  describe("error formatting", () => {
    it("escapes control characters in an unrecognized flag", () => {
      const formatter = CliOutput.defaultFormatter({ colors: false })
      const error = new CliError.UnrecognizedOption({
        option: "--foo\x1b]52;c;bWFsaWNpb3Vz\x07",
        suggestions: []
      })

      assert.strictEqual(
        formatter.formatCliError(error),
        "Unrecognized flag: --foo\\x1b]52;c;bWFsaWNpb3Vz\\x07"
      )
    })

    it("escapes control characters in an unknown subcommand with colors enabled", () => {
      const formatter = CliOutput.defaultFormatter({ colors: true })
      const error = new CliError.UnknownSubcommand({
        subcommand: "deplyo\x1b]8;;https://example.com\x07",
        suggestions: []
      })

      assert.strictEqual(
        formatter.formatError(error),
        `\n\x1b[1m\x1b[31mERROR\x1b[0m\n  Unknown subcommand "deplyo\\x1b]8;;https://example.com\\x07"\x1b[0m`
      )
    })

    it("escapes control characters in an invalid argument value without colors", () => {
      const formatter = CliOutput.defaultFormatter({ colors: false })
      const error = new CliError.InvalidValue({
        option: "count",
        value: "12\x1b]52;c;bWFsaWNpb3Vz\x07\x7f",
        expected: "an integer",
        kind: "argument"
      })

      assert.strictEqual(
        formatter.formatErrors([error]),
        `\nERROR\n  Invalid value for argument <count>: "12\\x1b]52;c;bWFsaWNpb3Vz\\x07\\x7f". Expected: an integer`
      )
    })

    it("preserves multi-line suggestion blocks", () => {
      const formatter = CliOutput.defaultFormatter({ colors: false })
      const errors = [
        new CliError.UnrecognizedOption({
          option: "--deplyo",
          suggestions: ["--deploy"]
        }),
        new CliError.UnknownSubcommand({
          subcommand: "usrs",
          parent: ["app"],
          suggestions: ["users"]
        })
      ]

      assert.strictEqual(
        formatter.formatErrors(errors),
        [
          "",
          "ERRORS",
          "  Unrecognized flag: --deplyo",
          "",
          "  Did you mean this?",
          "    --deploy",
          "  Unknown subcommand \"usrs\" for \"app\"",
          "",
          "  Did you mean this?",
          "    users"
        ].join("\n")
      )
    })

    it("preserves line feeds and tabs in error messages", () => {
      const formatter = CliOutput.defaultFormatter({ colors: false })
      const error = new CliError.InvalidValue({
        option: "count",
        value: "twelve",
        expected: "one line\n\tcontinuation",
        kind: "argument"
      })

      assert.strictEqual(
        formatter.formatCliError(error),
        "Invalid value for argument <count>: \"twelve\". Expected: one line\n\tcontinuation"
      )
    })

    it("formats single error with ERROR header", () => {
      const formatter = CliOutput.defaultFormatter({ colors: false })
      const error = new CliError.MissingOption({ option: "value" })

      const output = formatter.formatErrors([error])

      assert.isTrue(output.includes("ERROR"))
      assert.isTrue(output.includes("Missing required flag"))
    })

    it("formats multiple errors with ERRORS header", () => {
      const formatter = CliOutput.defaultFormatter({ colors: false })
      const errors = [
        new CliError.UnrecognizedOption({ option: "--foo", suggestions: [] }),
        new CliError.UnrecognizedOption({ option: "--bar", suggestions: [] })
      ]

      const output = formatter.formatErrors(errors)

      assert.isTrue(output.includes("ERRORS"))
      assert.isTrue(output.includes("--foo"))
      assert.isTrue(output.includes("--bar"))
    })

    it("returns empty string for empty array", () => {
      const formatter = CliOutput.defaultFormatter({ colors: false })
      const output = formatter.formatErrors([])
      assert.strictEqual(output, "")
    })
  })

  describe("UserError", () => {
    it("prefers the user-facing message over the cause", () => {
      const error = new CliError.UserError({
        cause: new Error("internal details"),
        userMessage: "Could not deploy the application"
      })

      assert.strictEqual(error.message, "Could not deploy the application")
    })

    it("uses an Error cause message as the fallback", () => {
      const error = new CliError.UserError({
        cause: new Error("Connection refused")
      })

      assert.strictEqual(error.message, "Connection refused")
    })

    it("uses a string cause as the fallback", () => {
      const error = new CliError.UserError({ cause: "Connection refused" })

      assert.strictEqual(error.message, "Connection refused")
    })

    it("uses a generic fallback for causes without a message", () => {
      const error = new CliError.UserError({ cause: { status: 503 } })

      assert.strictEqual(error.message, "An error occurred")
    })

    it("falls back past empty user-facing and cause messages", () => {
      const emptyUserMessage = new CliError.UserError({
        cause: new Error("Connection refused"),
        userMessage: ""
      })
      const emptyCause = new CliError.UserError({ cause: "" })

      assert.strictEqual(emptyUserMessage.message, "Connection refused")
      assert.strictEqual(emptyCause.message, "An error occurred")
    })

    it("allows runtime reporting before the CLI runner renders it", () => {
      const error = new CliError.UserError({ cause: "failed" })

      assert.isTrue(Runtime.getErrorReported(error))
    })

    it("escapes control characters in the user-facing message", () => {
      const formatter = CliOutput.defaultFormatter({ colors: false })
      const error = new CliError.UserError({
        cause: "internal details",
        userMessage: "Deployment failed\x1b]52;c;bWFsaWNpb3Vz\x07"
      })

      assert.strictEqual(
        formatter.formatError(error),
        "\nERROR\n  Deployment failed\\x1b]52;c;bWFsaWNpb3Vz\\x07"
      )
    })

    it("formats the resolved fallback message with other CLI errors", () => {
      const formatter = CliOutput.defaultFormatter({ colors: false })
      const error = new CliError.UserError({ cause: new Error("Connection refused") })

      assert.strictEqual(formatter.formatErrors([error]), "\nERROR\n  Connection refused")
    })
  })

  describe("InvalidValue", () => {
    it("labels a bare expected description", () => {
      const error = new CliError.InvalidValue({
        option: "size",
        value: "bogus",
        expected: `"small" | "medium" | "large"`,
        kind: "flag"
      })

      assert.strictEqual(
        error.message,
        `Invalid value for flag --size: "bogus". Expected: "small" | "medium" | "large"`
      )
    })

    it("does not double the prefix for an Expected sentence", () => {
      const error = new CliError.InvalidValue({
        option: "count",
        value: "3.14",
        expected: "Expected an integer, got 3.14",
        kind: "argument"
      })

      assert.strictEqual(
        error.message,
        `Invalid value for argument <count>: "3.14". Expected an integer, got 3.14`
      )

      const labeled = new CliError.InvalidValue({
        option: "count",
        value: "x",
        expected: "Expected: an integer",
        kind: "flag"
      })

      assert.strictEqual(
        labeled.message,
        `Invalid value for flag --count: "x". Expected: an integer`
      )
    })

    it("does not double the prefix for a missing flag value", () => {
      const error = new CliError.InvalidValue({
        option: "count",
        value: "",
        expected: `Expected a string representing a finite number, got ""`,
        kind: "flag"
      })

      assert.strictEqual(
        error.message,
        `Missing value for flag --count. Expected a string representing a finite number, got ""`
      )
    })
  })

  describe("UnexpectedArgument", () => {
    it("formats one or more unexpected positional arguments", () => {
      const single = new CliError.UnexpectedArgument({
        arguments: ["extra"]
      })
      const multiple = new CliError.UnexpectedArgument({
        arguments: ["first", "second"]
      })

      assert.strictEqual(single.message, `Unexpected positional argument: "extra"`)
      assert.strictEqual(multiple.message, `Unexpected positional arguments: "first", "second"`)
    })
  })
})
