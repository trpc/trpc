import { assert, describe, expect, it } from "@effect/vitest"
import { Effect, FileSystem, Layer, Option, Path, PlatformError, Ref, Result, Stdio } from "effect"
import { Argument, CliOutput, Command, Flag } from "effect/cli"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import { TestConsole } from "effect/testing"
import * as MockTerminal from "./services/MockTerminal.ts"

const ConsoleLayer = TestConsole.layer
const FileSystemLayer = FileSystem.layerNoop({
  exists: (path) =>
    path.includes("/non/existent/file.txt")
      ? Effect.succeed(false)
      : Effect.succeed(true),
  stat: (path) => {
    if (path.includes("/non/existent/file.txt")) {
      return Effect.fail(PlatformError.badArgument({ module: "", method: "" }))
    }
    if (path.endsWith("workspace")) {
      return Effect.succeed({ type: "Directory" } as any)
    }
    return Effect.succeed({ type: "File" } as any)
  },
  access: (path) =>
    path.includes("/non/existent/file.txt")
      ? Effect.fail(PlatformError.badArgument({ module: "", method: "" }))
      : Effect.void
})
const PathLayer = Path.layer
const TerminalLayer = MockTerminal.layer
const CliOutputLayer = CliOutput.layer(
  CliOutput.defaultFormatter({
    colors: false
  })
)
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
  CliOutputLayer,
  StdioLayer,
  ChildProcessSpawnerLayer
)

describe("Command arguments", () => {
  it.effect("should parse all argument types correctly", () =>
    Effect.gen(function*() {
      // Create a Ref to store the result
      const resultRef = yield* Ref.make<any>(null)

      // Create test command with various argument types
      const testCommand = Command.make("test", {
        name: Argument.String("name"),
        count: Argument.Int("count"),
        ratio: Argument.Finite("ratio"),
        env: Argument.Literals("env", ["dev", "prod"]),
        config: Argument.File("config", { mustExist: false }),
        workspace: Argument.Directory("workspace", { mustExist: false }),
        startDate: Argument.Date("start-date"),
        verbose: Flag.Boolean("verbose")
      }, (config) => Ref.set(resultRef, config))

      // Test parsing with valid arguments
      yield* Command.runWith(testCommand, { version: "1.0.0" })([
        "myapp", // name
        "42", // count
        "3.14", // ratio
        "dev", // env
        "./config.json", // config
        "./workspace", // workspace
        "2024-01-01", // startDate
        "--verbose" // flag
      ])

      const result = yield* Ref.get(resultRef)
      assert.strictEqual(result.name, "myapp")
      assert.strictEqual(result.count, 42)
      assert.strictEqual(result.ratio, 3.14)
      assert.strictEqual(result.env, "dev")
      assert.isTrue(result.config.includes("config.json"))
      // assert.isTrue(result.workspace.includes("workspace"))
      assert.deepStrictEqual(result.startDate, new Date("2024-01-01"))
      assert.strictEqual(result.verbose, true)
    }).pipe(Effect.provide(TestLayer)))

  it.effect("should handle file mustExist validation", () =>
    Effect.gen(function*() {
      // Test 1: mustExist: true with existing file - should pass
      const result1Ref = yield* Ref.make<string | null>(null)
      const existingFileCommand = Command.make("test", {
        file: Argument.File("file", { mustExist: true })
      }, ({ file }) => Ref.set(result1Ref, file))

      yield* Command.runWith(existingFileCommand, { version: "1.0.0" })(["/file.txt"])
      const result1 = yield* Ref.get(result1Ref)
      assert.strictEqual(result1, "/file.txt")

      // Test 2: mustExist: true with non-existing file - should display error and help
      const runCommand = Command.runWith(existingFileCommand, { version: "1.0.0" })
      yield* runCommand(["/non/existent/file.txt"]).pipe(
        Effect.catchTag("ShowHelp", () => Effect.void)
      )

      // Check that help was shown
      const stdout = yield* TestConsole.logLines
      assert.isTrue(stdout.some((line) => String(line).includes("USAGE")))

      // Check that error was shown
      const stderr = yield* TestConsole.errorLines
      assert.isTrue(stderr.some((line) => String(line).includes("ERROR")))
      assert.isTrue(stderr.some((line) => String(line).includes("does not exist")))

      // Test 3: mustExist: false - should always pass
      const result3Ref = yield* Ref.make<string | null>(null)
      const optionalFileCommand = Command.make("test", {
        file: Argument.File("file", { mustExist: false })
      }, ({ file }) => Ref.set(result3Ref, file))

      yield* Command.runWith(optionalFileCommand, { version: "1.0.0" })([
        "/non/existent/file.txt"
      ])
      const result3 = yield* Ref.get(result3Ref)
      assert.isTrue(result3!.includes("/non/existent/file.txt"))
    }).pipe(Effect.provide(TestLayer)))

  it.effect("should fail with invalid arguments", () =>
    Effect.gen(function*() {
      const testCommand = Command.make("test", {
        count: Argument.Int("count"),
        env: Argument.Literals("env", ["dev", "prod"])
      }, (config) => Effect.succeed(config))

      // Test invalid integer - should display help and error
      const runCommand = Command.runWith(testCommand, { version: "1.0.0" })
      yield* runCommand(["not-a-number", "dev"]).pipe(
        Effect.catchTag("ShowHelp", () => Effect.void)
      )

      // Check help was shown
      const stdout = yield* TestConsole.logLines
      const helpText = stdout.join("\n")
      expect(helpText).toContain("USAGE")
      expect(helpText).toContain("test [flags] <count> <env>")
      expect(helpText).toContain("count integer")
      expect(helpText).toContain("env choice")

      // Check error was shown
      const stderr = yield* TestConsole.errorLines
      const errorText = stderr.join("\n")
      expect(errorText).toMatchInlineSnapshot(`
        "
        ERROR
          Invalid value for argument <count>: "not-a-number". Expected a string representing a finite number"
      `)
    }).pipe(Effect.provide(TestLayer)))

  it.effect("should handle variadic arguments", () =>
    Effect.gen(function*() {
      let result: { readonly files: ReadonlyArray<string> } | undefined

      const testCommand = Command.make("test", {
        files: Argument.variadic(Argument.String("files"))
      }, (parsedConfig) =>
        Effect.sync(() => {
          result = parsedConfig
        }))

      yield* Command.runWith(testCommand, { version: "1.0.0" })([
        "file1.txt",
        "file2.txt",
        "file3.txt"
      ])

      assert.isDefined(result)
      assert.deepStrictEqual(result.files, ["file1.txt", "file2.txt", "file3.txt"])
    }).pipe(Effect.provide(TestLayer)))

  it.effect("should handle choiceWithValue", () =>
    Effect.gen(function*() {
      const resultRef = yield* Ref.make<any>(null)

      const testCommand = Command.make("test", {
        level: Argument.ChoiceWithValue(
          "level",
          [
            ["debug", 0],
            ["info", 1],
            ["error", 2]
          ] as const
        )
      }, (config) => Ref.set(resultRef, config))

      yield* Command.runWith(testCommand, { version: "1.0.0" })(["info"])
      const result = yield* Ref.get(resultRef)
      assert.strictEqual(result.level, 1)
    }).pipe(Effect.provide(TestLayer)))

  it.effect("should handle filter combinator - valid", () =>
    Effect.gen(function*() {
      const resultRef = yield* Ref.make<any>(null)

      const testCommand = Command.make("test", {
        port: Argument.Int("port").pipe(
          Argument.filter(
            (n) => n >= 1 && n <= 65535,
            (n) => `Port ${n} out of range (1-65535)`
          )
        )
      }, (config) => Ref.set(resultRef, config))

      yield* Command.runWith(testCommand, { version: "1.0.0" })(["8080"])
      const result = yield* Ref.get(resultRef)
      assert.strictEqual(result.port, 8080)
    }).pipe(Effect.provide(TestLayer)))

  it.effect("should handle filter combinator - invalid", () =>
    Effect.gen(function*() {
      const testCommand = Command.make("test", {
        port: Argument.Int("port").pipe(
          Argument.filter(
            (n) => n >= 1 && n <= 65535,
            (n) => `Port ${n} out of range (1-65535)`
          )
        )
      }, () => Effect.void)

      yield* Command.runWith(testCommand, { version: "1.0.0" })(["99999"]).pipe(
        Effect.catchTag("ShowHelp", () => Effect.void)
      )
      const stderr = yield* TestConsole.errorLines
      assert.isTrue(stderr.some((line) => String(line).includes("out of range")))
    }).pipe(Effect.provide(TestLayer)))

  it.effect("should handle filterMap combinator - valid", () =>
    Effect.gen(function*() {
      const resultRef = yield* Ref.make<any>(null)

      const testCommand = Command.make("test", {
        positiveInt: Argument.Int("num").pipe(
          Argument.filterMap(
            (n) => n > 0 ? Option.some(n) : Option.none(),
            (n) => `Expected positive integer, got ${n}`
          )
        )
      }, (config) => Ref.set(resultRef, config))

      yield* Command.runWith(testCommand, { version: "1.0.0" })(["42"])
      const result = yield* Ref.get(resultRef)
      assert.strictEqual(result.positiveInt, 42)
    }).pipe(Effect.provide(TestLayer)))

  it.effect("should handle filterMap combinator - invalid", () =>
    Effect.gen(function*() {
      const testCommand = Command.make("test", {
        positiveInt: Argument.Int("num").pipe(
          Argument.filterMap(
            (n) => n > 0 ? Option.some(n) : Option.none(),
            (n) => `Expected positive integer, got ${n}`
          )
        )
      }, () => Effect.void)

      yield* Command.runWith(testCommand, { version: "1.0.0" })(["0"]).pipe(
        Effect.catchTag("ShowHelp", () => Effect.void)
      )
      const stderr = yield* TestConsole.errorLines
      assert.isTrue(stderr.some((line) => String(line).includes("Expected positive integer")))
    }).pipe(Effect.provide(TestLayer)))

  it.effect("should handle orElse combinator", () =>
    Effect.gen(function*() {
      const resultRef = yield* Ref.make<any>(null)

      // Try parsing as integer first, fallback to 0
      const testCommand = Command.make("test", {
        value: Argument.Int("value").pipe(
          Argument.orElse(() => Argument.String("value").pipe(Argument.map(() => -1)))
        )
      }, (config) => Ref.set(resultRef, config))

      // Valid integer
      yield* Command.runWith(testCommand, { version: "1.0.0" })(["42"])
      let result = yield* Ref.get(resultRef)
      assert.strictEqual(result.value, 42)

      // Invalid integer, falls back to string path
      yield* Ref.set(resultRef, null)
      yield* Command.runWith(testCommand, { version: "1.0.0" })(["abc"])
      result = yield* Ref.get(resultRef)
      assert.strictEqual(result.value, -1)
    }).pipe(Effect.provide(TestLayer)))

  it.effect("should handle orElseResult combinator", () =>
    Effect.gen(function*() {
      const resultRef = yield* Ref.make<any>(null)

      const testCommand = Command.make("test", {
        value: Argument.Int("value").pipe(
          Argument.orElseResult(() => Argument.String("value"))
        )
      }, (config) => Ref.set(resultRef, config))

      // Valid integer - returns Success
      yield* Command.runWith(testCommand, { version: "1.0.0" })(["42"])
      let result = yield* Ref.get(resultRef)
      assert.isTrue(Result.isSuccess(result.value))
      assert.strictEqual(result.value.success, 42)

      // Invalid integer - returns Failure with string
      yield* Ref.set(resultRef, null)
      yield* Command.runWith(testCommand, { version: "1.0.0" })(["abc"])
      result = yield* Ref.get(resultRef)
      assert.isTrue(Result.isFailure(result.value))
      assert.strictEqual(result.value.failure, "abc")
    }).pipe(Effect.provide(TestLayer)))

  it.effect("should handle withMetavar combinator", () =>
    Effect.gen(function*() {
      const testCommand = Command.make("test", {
        file: Argument.String("file").pipe(
          Argument.withMetavar("FILE_PATH")
        )
      }, () => Effect.void)

      // Run with help flag to check pseudo name appears in help
      yield* Command.runWith(testCommand, { version: "1.0.0" })(["--help"])
      const stdout = yield* TestConsole.logLines
      const helpText = stdout.join("\n")
      assert.isTrue(helpText.includes("FILE_PATH"))
    }).pipe(Effect.provide(TestLayer)))

  it.effect("should handle optional arguments - when provided", () =>
    Effect.gen(function*() {
      const resultRef = yield* Ref.make<any>(null)

      const testCommand = Command.make("test", {
        label: Argument.optional(
          Argument.String("label").pipe(
            Argument.withDescription("Optional label name")
          )
        )
      }, (config) => Ref.set(resultRef, config))

      // When optional argument IS provided
      yield* Command.runWith(testCommand, { version: "1.0.0" })(["my-label"])
      const result = yield* Ref.get(resultRef)
      assert.isTrue(Option.isSome(result.label))
      assert.strictEqual(result.label.value, "my-label")
    }).pipe(Effect.provide(TestLayer)))

  it.effect("returns none for omitted optional positional arguments", () =>
    Effect.gen(function*() {
      // BUG TEST: Argument.optional() should work for positional arguments
      // Currently it only catches MissingOption, not MissingArgument
      const optionalArg = Argument.optional(Argument.String("label"))

      // Parse with empty arguments - should succeed with Option.none()
      const result = yield* optionalArg.parse({ flags: {}, arguments: [] })

      // If we get here without error, optional is working
      const [_leftover, value] = result
      assert.isTrue(Option.isNone(value), "Should be Option.none()")
    }).pipe(Effect.provide(TestLayer)))

  it.effect("uses argument wording for positional InvalidValue errors", () =>
    Effect.gen(function*() {
      // When a positional argument has an invalid value, the error should say "argument"
      // not "flag" (which would be confusing)
      const intArg = Argument.Int("count")

      const result = yield* Effect.exit(
        intArg.parse({ flags: {}, arguments: ["not-a-number"] })
      )

      assert.isTrue(result._tag === "Failure", "Should fail with invalid integer")
      if (result._tag === "Failure") {
        // Extract the error from the cause
        const cause = result.cause
        // The cause structure is { _id: 'Cause', failures: [...] } but we need to access it properly
        const errorMessage = String(cause)

        // Error message should NOT say "flag"
        assert.isFalse(
          errorMessage.includes("flag --"),
          `Error message should not say 'flag --' for positional arguments: ${errorMessage}`
        )
        // Error message SHOULD say "argument"
        assert.isTrue(
          errorMessage.includes("argument"),
          `Error message should say 'argument': ${errorMessage}`
        )
      }
    }).pipe(Effect.provide(TestLayer)))
})
