import { assert, describe, expect, it } from "@effect/vitest"
import { Context, Effect, Fiber, FileSystem, Layer, Option, Path, Redacted, Runtime, Stdio } from "effect"
import { Argument, CliConfig, CliError, CliOutput, Command, Flag, GlobalFlag } from "effect/cli"
import { toImpl } from "effect/cli/internal/command"
import { ChildProcessSpawner } from "effect/process"
import { TestConsole } from "effect/testing"
import * as Cli from "./fixtures/ComprehensiveCli.ts"
import * as MockTerminal from "./services/MockTerminal.ts"
import * as TestActions from "./services/TestActions.ts"

const ActionsLayer = TestActions.layer
const ConsoleLayer = TestConsole.layer
const FileSystemLayer = FileSystem.layerNoop({})
const PathLayer = Path.layer
const TerminalLayer = MockTerminal.layer
const CliOutputLayer = CliOutput.layer(
  CliOutput.defaultFormatter({
    colors: false
  })
)

const TestLayer = Layer.mergeAll(
  ActionsLayer,
  ConsoleLayer,
  FileSystemLayer,
  PathLayer,
  TerminalLayer,
  CliOutputLayer,
  Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make(() => Effect.die("Not implemented"))
  ),
  Stdio.layerTest({})
)

const TestLayerWithoutFormatter = Layer.mergeAll(
  ActionsLayer,
  ConsoleLayer,
  FileSystemLayer,
  PathLayer,
  TerminalLayer,
  Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make(() => Effect.die("Not implemented"))
  ),
  Stdio.layerTest({})
)

describe("Command", () => {
  describe("annotations", () => {
    it.effect("should expose annotations in help docs", () =>
      Effect.gen(function*() {
        const Team = Context.Service<never, string>("effect/test/unstable/cli/Team")
        const Priority = Context.Service<never, number>("effect/test/unstable/cli/Priority")
        const docs: Array<Parameters<CliOutput.Formatter["formatHelpDoc"]>[0]> = []

        const formatter: CliOutput.Formatter = {
          ...CliOutput.defaultFormatter({ colors: false }),
          formatHelpDoc: (doc) => {
            docs.push(doc)
            return ""
          }
        }

        const command = Command.make("deploy").pipe(
          Command.annotate(Team, "runtime"),
          Command.annotateMerge(Context.make(Priority, 2))
        )

        yield* Command.runWith(command, { version: "1.0.0" })(["--help"]).pipe(
          Effect.provide(TestLayerWithoutFormatter),
          Effect.provideService(CliOutput.Formatter, formatter)
        )

        assert.strictEqual(docs.length, 1)
        const annotations = docs[0].annotations
        assert.strictEqual(Context.get(annotations, Team), "runtime")
        assert.strictEqual(Context.get(annotations, Priority), 2)
      }))

    it.effect("should keep annotations when adding subcommands", () =>
      Effect.gen(function*() {
        const Scope = Context.Service<never, string>("effect/test/unstable/cli/Scope")
        const docs: Array<Parameters<CliOutput.Formatter["formatHelpDoc"]>[0]> = []

        const formatter: CliOutput.Formatter = {
          ...CliOutput.defaultFormatter({ colors: false }),
          formatHelpDoc: (doc) => {
            docs.push(doc)
            return ""
          }
        }

        const child = Command.make("child").pipe(Command.annotate(Scope, "child"))
        const command = Command.make("root").pipe(
          Command.annotate(Scope, "root"),
          Command.withSubcommands([child])
        )

        const run = Command.runWith(command, { version: "1.0.0" })

        yield* run(["--help"]).pipe(
          Effect.provide(TestLayerWithoutFormatter),
          Effect.provideService(CliOutput.Formatter, formatter)
        )

        yield* run(["child", "--help"]).pipe(
          Effect.provide(TestLayerWithoutFormatter),
          Effect.provideService(CliOutput.Formatter, formatter)
        )

        assert.strictEqual(docs.length, 2)
        assert.strictEqual(Context.get(docs[0].annotations, Scope), "root")
        assert.strictEqual(Context.get(docs[1].annotations, Scope), "child")
      }))
  })

  describe("run", () => {
    it.effect("should invoke the wizard programmatically from a command handler", () =>
      Effect.gen(function*() {
        const captured: Array<ReadonlyArray<string>> = []
        const target = Command.make("greet", {
          name: Flag.String("name"),
          count: Argument.Int("count")
        })
        const command = Command.make("launcher", {}, () =>
          Effect.flatMap(Command.wizard(target), (args) =>
            Effect.sync(() => {
              captured.push(args)
            })))

        const fiber = yield* Command.runWith(command, { version: "1.0.0" })([]).pipe(Effect.forkChild)
        yield* MockTerminal.inputText("Alice")
        yield* MockTerminal.inputKey("enter")
        yield* MockTerminal.inputText("2")
        yield* MockTerminal.inputKey("enter")
        yield* Fiber.join(fiber)

        assert.deepStrictEqual(captured, [["greet", "--name", "Alice", "2"]])
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should run wizard-generated arguments with --wizard", () =>
      Effect.gen(function*() {
        const captured: Array<string> = []
        const command = Command.make("greet", {
          name: Flag.String("name")
        }, ({ name }) => Effect.sync(() => captured.push(name)))

        const fiber = yield* Command.runWith(command, { version: "1.0.0" })(["--wizard"]).pipe(Effect.forkChild)
        yield* MockTerminal.inputText("Alice Smith")
        yield* MockTerminal.inputKey("enter")
        yield* MockTerminal.inputKey("enter")
        yield* Fiber.join(fiber)

        assert.deepStrictEqual(captured, ["Alice Smith"])
        const output = [...yield* TestConsole.logLines, ...yield* MockTerminal.displayLines].join("\n")
        assert.include(output, "Command wizard")
        assert.include(output, "Build a command interactively. Press Ctrl+C to cancel.")
        assert.include(output, "Current command")
        assert.include(output, "ROOT")
        assert.include(output, "FLAGS")
        assert.include(output, "Name (--name)")
        assert.include(output, "Command ready")
        assert.include(output, "$ greet --name 'Alice Smith'")
        assert.include(output, "Run this command?")
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should parse negative numbers as flag and argument values", () =>
      Effect.gen(function*() {
        const captured: Array<readonly [number, number, number]> = []
        const command = Command.make("geo", {
          lat: Flag.Finite("lat"),
          lon: Flag.Finite("lon"),
          offset: Argument.Int("offset")
        }, ({ lat, lon, offset }) => Effect.sync(() => captured.push([lat, lon, offset])))

        yield* Command.runWith(command, { version: "1.0.0" })(["--lat", "-40.41", "--lon", "-3.70", "-2"])

        assert.deepStrictEqual(captured, [[-40.41, -3.7, -2]])
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should run negative integer flag values with --wizard", () =>
      Effect.gen(function*() {
        const captured: Array<number> = []
        const command = Command.make("demo", {
          offset: Flag.Int("offset")
        }, ({ offset }) => Effect.sync(() => captured.push(offset)))

        const fiber = yield* Command.runWith(command, { version: "1.0.0" })(["--wizard"]).pipe(Effect.forkChild)
        yield* MockTerminal.inputText("-2")
        yield* MockTerminal.inputKey("enter")
        yield* MockTerminal.inputKey("enter")
        yield* Fiber.join(fiber)

        assert.deepStrictEqual(captured, [-2])
        const output = [...yield* TestConsole.logLines, ...yield* MockTerminal.displayLines].join("\n")
        assert.include(output, "$ demo --offset=-2")
      }).pipe(Effect.provide(TestLayer)))

    for (
      const { args: expectedArgs, value } of [
        { value: "-v", args: ["--value=-v"] },
        { value: "--verbose", args: ["--value=--verbose"] },
        { value: "--", args: ["--value=--"] },
        { value: "--mode=x=y", args: ["--value=--mode=x=y"] },
        { value: "plain", args: ["--value", "plain"] },
        { value: "", args: ["--value", ""] },
        { value: "-", args: ["--value", "-"] }
      ]
    ) {
      it.effect(`should round trip wizard flag value ${JSON.stringify(value)}`, () =>
        Effect.gen(function*() {
          const captured: Array<string> = []
          const command = Command.make("demo", {
            value: Flag.String("value")
          }, ({ value }) => Effect.sync(() => captured.push(value)))

          const fiber = yield* Command.wizard(command).pipe(Effect.forkChild)
          yield* MockTerminal.inputText(value)
          yield* MockTerminal.inputKey("enter")
          const args = yield* Fiber.join(fiber)

          assert.deepStrictEqual(args, ["demo", ...expectedArgs])
          yield* Command.runWith(command, { version: "1.0.0" })(args.slice(1))
          assert.deepStrictEqual(captured, [value])
        }).pipe(Effect.provide(TestLayer)))
    }

    it.effect("should round trip mixed repeated wizard flag values", () =>
      Effect.gen(function*() {
        const values = ["-v", "plain", "--name=x", ""]
        const captured: Array<ReadonlyArray<string>> = []
        const command = Command.make("demo", {
          value: Flag.String("value").pipe(Flag.atLeast(1))
        }, ({ value }) => Effect.sync(() => captured.push(value)))

        const fiber = yield* Command.wizard(command).pipe(Effect.forkChild)
        yield* MockTerminal.inputKey("backspace")
        yield* MockTerminal.inputText("4")
        yield* MockTerminal.inputKey("enter")
        for (const value of values) {
          yield* MockTerminal.inputText(value)
          yield* MockTerminal.inputKey("enter")
        }
        const args = yield* Fiber.join(fiber)

        assert.deepStrictEqual(args, ["demo", "--value=-v", "--value", "plain", "--value=--name=x", "--value", ""])
        yield* Command.runWith(command, { version: "1.0.0" })(args.slice(1))
        assert.deepStrictEqual(captured, [values])
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should redact option-looking values in wizard command output", () =>
      Effect.gen(function*() {
        const secret = "-hunter2-secret"
        const captured: Array<readonly [string, string]> = []
        const command = Command.make("login", {
          password: Flag.Redacted("password"),
          account: Argument.String("account")
        }, ({ account, password }) =>
          Effect.sync(() => {
            captured.push([Redacted.value(password), account])
          }))

        const fiber = yield* Command.runWith(command, { version: "1.0.0" })(["--wizard"]).pipe(Effect.forkChild)
        yield* MockTerminal.inputText(secret)
        yield* MockTerminal.inputKey("enter")
        yield* MockTerminal.inputText("alice")
        yield* MockTerminal.inputKey("enter")
        yield* MockTerminal.inputKey("enter")
        yield* Fiber.join(fiber)

        const output = [...yield* TestConsole.logLines, ...yield* MockTerminal.displayLines].join("\n")
        const currentCommand = output.slice(output.indexOf("Current command"), output.indexOf("Command ready"))
        const commandReady = output.slice(output.indexOf("Command ready"))

        assert.deepStrictEqual(captured, [[secret, "alice"]])
        assert.include(currentCommand, "--password=<redacted>")
        assert.include(commandReady, "--password=<redacted>")
        assert.notInclude(output, secret)
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should print a message when wizard mode is cancelled", () =>
      Effect.gen(function*() {
        let invoked = false
        const command = Command.make("greet", {
          name: Flag.String("name")
        }, () =>
          Effect.sync(() => {
            invoked = true
          }))

        const fiber = yield* Command.runWith(command, { version: "1.0.0" })(["--wizard"]).pipe(Effect.forkChild)
        yield* MockTerminal.inputKey("c", { ctrl: true })
        yield* Fiber.join(fiber)

        const output = [...yield* TestConsole.logLines, ...yield* MockTerminal.displayLines].join("\n")
        assert.isFalse(invoked)
        assert.include(output, "Wizard cancelled.")
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should render boolean wizard values consistently", () =>
      Effect.gen(function*() {
        const captured: Array<boolean> = []
        const command = Command.make("deploy", {
          dryRun: Flag.Boolean("dry-run")
        }, ({ dryRun }) => Effect.sync(() => captured.push(dryRun)))

        const fiber = yield* Command.runWith(command, { version: "1.0.0" })(["--wizard"]).pipe(Effect.forkChild)
        yield* MockTerminal.inputKey("y")
        yield* MockTerminal.inputKey("enter")
        yield* Fiber.join(fiber)

        const output = [...yield* TestConsole.logLines, ...yield* MockTerminal.displayLines].join("\n")
        assert.deepStrictEqual(captured, [true])
        assert.include(output, "Dry run (--dry-run)")
        assert.include(output, "deploy --dry-run true")
        assert.notInclude(output, "on / off")
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should start wizard mode at a selected subcommand", () =>
      Effect.gen(function*() {
        const captured: Array<string> = []
        const child = Command.make("child", {
          value: Argument.String("value")
        }, ({ value }) => Effect.sync(() => captured.push(value)))
        const command = Command.make("root").pipe(Command.withSubcommands([child]))

        const fiber = yield* Command.runWith(command, { version: "1.0.0" })(["child", "--wizard"]).pipe(
          Effect.forkChild
        )
        yield* MockTerminal.inputText("selected")
        yield* MockTerminal.inputKey("enter")
        yield* MockTerminal.inputKey("enter")
        yield* Fiber.join(fiber)

        assert.deepStrictEqual(captured, ["selected"])
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should reject --completions without a shell", () =>
      Effect.gen(function*() {
        let invoked = false
        const command = Command.make("demo", {}, () =>
          Effect.sync(() => {
            invoked = true
          }))

        yield* Command.runWith(command, { version: "1.0.0" })(["--completions"]).pipe(Effect.ignore)

        const stderr = yield* TestConsole.errorLines
        assert.isFalse(invoked)
        assert.isTrue(
          stderr.some((line) =>
            String(line).includes("Missing value for flag --completions. Expected: bash | zsh | fish | sh")
          )
        )
      }).pipe(Effect.provide(TestLayer)))

    const missingValueCases: ReadonlyArray<{
      readonly flag: Flag.Flag<unknown>
      readonly name: string
      readonly expected: string
    }> = [
      { flag: Flag.String("name").pipe(Flag.optional), name: "name", expected: "string" },
      { flag: Flag.Int("count").pipe(Flag.optional), name: "count", expected: "integer" },
      { flag: Flag.Path("config").pipe(Flag.optional), name: "config", expected: "path" },
      { flag: Flag.KeyValuePair("env").pipe(Flag.optional), name: "env", expected: "key=value" }
    ]

    for (const { expected, flag, name } of missingValueCases) {
      it.effect(`should reject --${name} without a ${expected} value`, () =>
        Effect.gen(function*() {
          let invoked = false
          const command = Command.make("demo", { value: flag }, () =>
            Effect.sync(() => {
              invoked = true
            }))

          yield* Command.runWith(command, { version: "1.0.0" })([`--${name}`]).pipe(Effect.ignore)

          const stderr = yield* TestConsole.errorLines
          assert.isFalse(invoked)
          assert.isTrue(
            stderr.some((line) => String(line).includes(`Missing value for flag --${name}. Expected: ${expected}`))
          )
        }).pipe(Effect.provide(TestLayer)))
    }

    it.effect("should render invalid choice values without doubling the Expected prefix", () =>
      Effect.gen(function*() {
        let invoked = false
        const command = Command.make("demo", {
          size: Flag.Literals("size", ["small", "medium", "large"])
        }, () =>
          Effect.sync(() => {
            invoked = true
          }))

        yield* Command.runWith(command, { version: "1.0.0" })(["--size", "bogus"]).pipe(Effect.ignore)

        const stderr = yield* TestConsole.errorLines
        assert.isFalse(invoked)
        assert.isTrue(
          stderr.some((line) =>
            String(line).includes(`Invalid value for flag --size: "bogus". Expected: "small" | "medium" | "large"`)
          )
        )
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should execute handler with parsed config", () =>
      Effect.gen(function*() {
        const path = yield* Path.Path
        const resolvedSrc = path.resolve("src.txt")
        const resolvedDest = path.resolve("dest.txt")

        yield* Cli.run(["copy", "src.txt", "dest.txt", "--recursive", "--force"])

        const actions = yield* TestActions.getActions
        assert.strictEqual(actions.length, 1)
        assert.deepStrictEqual(actions[0], {
          command: "copy",
          details: {
            source: resolvedSrc,
            destination: resolvedDest,
            recursive: true,
            force: true,
            bufferSize: 64
          }
        })
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should handle nested config in handler", () =>
      Effect.gen(function*() {
        const username = "john_doe"
        const email = "john@example.com"
        const role = "admin"

        yield* Cli.run(["admin", "users", "create", username, email, "--role", role, "--notify"])

        const actions = yield* TestActions.getActions
        assert.strictEqual(actions.length, 1)
        assert.deepStrictEqual(actions[0], {
          command: "users create",
          details: { username, email: Option.some(email), role, notify: true }
        })
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should work with effectful handlers", () =>
      Effect.gen(function*() {
        const files = ["file1.txt", "file2.txt", "dir/"]

        yield* Cli.run(["remove", ...files, "--recursive", "--force", "--verbose"])

        const actions = yield* TestActions.getActions
        assert.strictEqual(actions.length, 1)
        assert.deepStrictEqual(actions[0], {
          command: "remove",
          details: {
            files,
            recursive: true,
            force: true,
            verbose: true
          }
        })
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should work with option aliases in handler", () =>
      Effect.gen(function*() {
        const config = "build.json"
        const output = "dist/"

        yield* Cli.run(["build", "-o", output, "-v", "-f", config])

        const actions = yield* TestActions.getActions
        assert.strictEqual(actions.length, 1)
        assert.deepStrictEqual(actions[0], {
          command: "build",
          details: { output, verbose: true, config }
        })
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should merge repeated key=value flags into a single record", () =>
      Effect.gen(function*() {
        const captured: Array<Record<string, string>> = []

        const command = Command.make("env", {
          env: Flag.KeyValuePair("env")
        }, (config) =>
          Effect.sync(() => {
            captured.push(config.env)
          }))

        const runCommand = Command.runWith(command, {
          version: "1.0.0"
        })

        yield* runCommand([
          "--env",
          "foo=bar",
          "--env",
          "cool=dude"
        ])

        assert.deepStrictEqual(captured, [{ foo: "bar", cool: "dude" }])
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should merge key=value flags even when interleaved with other options", () =>
      Effect.gen(function*() {
        const captured: Array<Record<string, unknown>> = []

        const command = Command.make("env", {
          env: Flag.KeyValuePair("env"),
          verbose: Flag.Boolean("verbose"),
          profile: Flag.String("profile")
        }, (config) =>
          Effect.sync(() => {
            captured.push(config)
          }))

        const runCommand = Command.runWith(command, {
          version: "1.0.0"
        })

        yield* runCommand([
          "--env",
          "foo=bar",
          "--profile",
          "dev",
          "--env",
          "cool=dude",
          "--verbose",
          "--env",
          "zip=zop"
        ])

        assert.deepStrictEqual(captured, [{
          env: { foo: "bar", cool: "dude", zip: "zop" },
          verbose: true,
          profile: "dev"
        }])
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should expose setting global flags to command handlers", () =>
      Effect.gen(function*() {
        const Region = GlobalFlag.Setting("region")({
          flag: Flag.String("region").pipe(Flag.optional)
        })
        const captured: Array<Option.Option<string>> = []

        const command = Command.make("deploy", {}, () =>
          Effect.gen(function*() {
            captured.push(yield* Region)
          })).pipe(
            Command.withGlobalFlags([Region])
          )

        const runCommand = Command.runWith(command, {
          version: "1.0.0"
        })

        yield* runCommand(["--region", "us-east-1"])
        yield* runCommand([])

        assert.deepStrictEqual(captured, [Option.some("us-east-1"), Option.none()])
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should expose setting global flags with Flag.withDefault", () =>
      Effect.gen(function*() {
        const Region = GlobalFlag.Setting("region")({
          flag: Flag.String("region").pipe(Flag.withDefault("us-west-2"))
        })
        const captured: Array<string> = []

        const command = Command.make("deploy", {}, () =>
          Effect.gen(function*() {
            captured.push(yield* Region)
          })).pipe(
            Command.withGlobalFlags([Region])
          )

        const runCommand = Command.runWith(command, {
          version: "1.0.0"
        })

        yield* runCommand(["--region", "eu-west-1"])
        yield* runCommand([])

        assert.deepStrictEqual(captured, ["eu-west-1", "us-west-2"])
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should configure built-in global flags per run", () =>
      Effect.gen(function*() {
        const command = Command.make("app", {}, () => Effect.void)
        const runCommand = Command.runWith(command, { version: "1.0.0" })
        const config = CliConfig.make({
          builtIns: GlobalFlag.BuiltIns.filter((flag) => flag !== GlobalFlag.LogLevel)
        })

        yield* runCommand(["--help"]).pipe(Effect.provide(CliConfig.layer(config)))
        const configuredHelp = yield* TestConsole.logLines
        assert.isFalse(configuredHelp.some((line) => String(line).includes("--log-level")))

        yield* runCommand(["--log-level", "debug"]).pipe(
          Effect.provideService(CliConfig.CliConfig, config),
          Effect.ignore
        )
        const errors = yield* TestConsole.errorLines
        assert.isTrue(errors.some((line) => String(line).includes("Unrecognized flag: --log-level")))

        const helpCountBeforeDefault = (yield* TestConsole.logLines).length
        yield* runCommand(["--help"])
        const allHelp = yield* TestConsole.logLines
        const defaultHelp = allHelp.slice(helpCountBeforeDefault)
        assert.isTrue(defaultHelp.some((line) => String(line).includes("--log-level")))
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should support mixed action and setting global flags", () =>
      Effect.gen(function*() {
        const actions: Array<boolean> = []
        const captured: Array<string> = []
        let handlerInvocations = 0

        const VerboseAction = GlobalFlag.Action({
          flag: Flag.Boolean("verbose").pipe(Flag.withDefault(false)),
          run: (value) =>
            Effect.sync(() => {
              actions.push(value)
            })
        })
        const Format = GlobalFlag.Setting("format")({
          flag: Flag.String("format").pipe(Flag.withDefault("text"))
        })

        const command = Command.make("deploy", {}, () =>
          Effect.gen(function*() {
            handlerInvocations += 1
            captured.push(yield* Format)
          })).pipe(
            Command.withGlobalFlags([VerboseAction, Format])
          )

        const runCommand = Command.runWith(command, {
          version: "1.0.0"
        })

        yield* runCommand(["--format", "json"])
        yield* runCommand(["--verbose", "--format", "yaml"])

        assert.deepStrictEqual(captured, ["json"])
        assert.deepStrictEqual(actions, [true])
        assert.strictEqual(handlerInvocations, 1)
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should reject explicit values for canonical negated global flags", () =>
      Effect.gen(function*() {
        let handlerInvoked = false
        const Verbose = GlobalFlag.Setting("verbose")({
          flag: Flag.Boolean("verbose")
        })

        const command = Command.make("deploy", {}, () =>
          Effect.sync(() => {
            handlerInvoked = true
          })).pipe(
            Command.withGlobalFlags([Verbose])
          )

        const runCommand = Command.runWith(command, {
          version: "1.0.0"
        })

        yield* runCommand(["--no-verbose", "false"]).pipe(Effect.catchTag("ShowHelp", () => Effect.void))

        assert.isFalse(handlerInvoked)

        const stderr = yield* TestConsole.errorLines
        assert.isTrue(stderr.join("\n").includes("use --no-verbose by itself to set --verbose to false"))
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should expose setting global flags in Command.provide APIs", () =>
      Effect.gen(function*() {
        const Region = GlobalFlag.Setting("region")({
          flag: Flag.String("region").pipe(Flag.optional)
        })
        const RegionFromProvide = Context.Service<never, Option.Option<string>>(
          "effect/test/unstable/cli/RegionFromProvide"
        )
        const capturedFromProvide: Array<Option.Option<string>> = []
        const capturedFromProvideEffect: Array<Option.Option<string>> = []

        const command = Command.make("deploy", {}, () =>
          Effect.gen(function*() {
            capturedFromProvide.push(yield* RegionFromProvide)
          })).pipe(
            Command.provide(() =>
              Layer.effect(
                RegionFromProvide,
                Effect.gen(function*() {
                  return yield* Region
                })
              )
            ),
            Command.provideEffectDiscard(() =>
              Effect.gen(function*() {
                capturedFromProvideEffect.push(yield* Region)
              })
            ),
            Command.withGlobalFlags([Region])
          )

        const runCommand = Command.runWith(command, {
          version: "1.0.0"
        })

        yield* runCommand(["--region", "eu-west-1"])

        assert.deepStrictEqual(capturedFromProvide, [Option.some("eu-west-1")])
        assert.deepStrictEqual(capturedFromProvideEffect, [Option.some("eu-west-1")])
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should reject global flags that are out of scope for selected subcommand", () =>
      Effect.gen(function*() {
        const Region = GlobalFlag.Setting("region")({
          flag: Flag.String("region").pipe(Flag.withDefault("us-east-1"))
        })
        let dbInvoked = false
        let deployInvoked = false

        const deploy = Command.make("deploy", {}, () =>
          Effect.sync(() => {
            deployInvoked = true
          })).pipe(
            Command.withGlobalFlags([Region])
          )

        const db = Command.make("db", {}, () =>
          Effect.sync(() => {
            dbInvoked = true
          }))

        const root = Command.make("app", {}).pipe(Command.withSubcommands([deploy, db]))

        const runCommand = Command.runWith(root, {
          version: "1.0.0"
        })

        yield* runCommand(["db", "--region", "eu-west-1"]).pipe(
          Effect.ignore
        )

        const stderr = yield* TestConsole.errorLines
        assert.isTrue(
          stderr.some((line) => String(line).includes("--region")),
          "expected CLI to report out-of-scope global flag"
        )
        assert.isFalse(dbInvoked)
        assert.isFalse(deployInvoked)
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should show only path-active global flags in subcommand help", () =>
      Effect.gen(function*() {
        const Region = GlobalFlag.Setting("region")({
          flag: Flag.String("region").pipe(Flag.withDefault("us-east-1"))
        })

        const deploy = Command.make("deploy", {}, () => Effect.void).pipe(
          Command.withGlobalFlags([Region])
        )
        const db = Command.make("db", {}, () => Effect.void)
        const root = Command.make("app", {}).pipe(Command.withSubcommands([deploy, db]))

        const runCommand = Command.runWith(root, {
          version: "1.0.0"
        })

        yield* runCommand(["deploy", "--help"])
        const deployHelp = yield* TestConsole.logLines
        assert.isTrue(deployHelp.some((line) => String(line).includes("--region")))

        yield* runCommand(["db", "--help"])
        const dbHelp = yield* TestConsole.logLines
        const dbSection = dbHelp.slice(deployHelp.length)
        assert.isFalse(dbSection.some((line) => String(line).includes("--region")))
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should fail for malformed key=value flags", () =>
      Effect.gen(function*() {
        let invoked = false

        const command = Command.make("env", {
          env: Flag.KeyValuePair("env")
        }, () =>
          Effect.sync(() => {
            invoked = true
          }))

        const runCommand = Command.runWith(command, {
          version: "1.0.0"
        })

        yield* runCommand([
          "--env",
          "invalid"
        ]).pipe(Effect.ignore)

        const stderr = yield* TestConsole.errorLines
        assert.isTrue(
          stderr.some((line) => String(line).includes("Invalid key=value format")),
          "expected CLI to report invalid key=value format"
        )

        assert.isFalse(invoked)
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should handle parsing errors from run", () =>
      Effect.gen(function*() {
        const runCommand = Command.runWith(Cli.ComprehensiveCli, {
          version: "1.0.0"
        })

        yield* runCommand(["invalid-command"]).pipe(Effect.ignore)

        // Check that help text was shown to stdout
        const stdout = yield* TestConsole.logLines
        assert.isTrue(stdout.some((line) => String(line).includes("DESCRIPTION")))
        assert.isTrue(stdout.some((line) => String(line).includes("comprehensive CLI tool")))

        // Check that error was shown to stderr
        const stderr = yield* TestConsole.errorLines
        assert.isTrue(stderr.some((line) => String(line).includes("ERROR")))
        assert.isTrue(stderr.some((line) => String(line).includes("Unknown subcommand")))
        assert.isTrue(stderr.some((line) => String(line).includes("invalid-command")))
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should propagate handler errors from run", () =>
      Effect.gen(function*() {
        const result = yield* Effect.flip(Cli.run(["test-failing", "--input", "test"]))
        assert.strictEqual(result, "Handler error")
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should render and rethrow UserError handler failures without help", () =>
      Effect.gen(function*() {
        const failure = new CliError.UserError({
          cause: new Error("internal details"),
          userMessage: "Deployment failed"
        })
        const command = Command.make("deploy", {}, () => failure)

        const error = yield* Effect.flip(Command.runWith(command, { version: "1.0.0" })([]))

        assert.strictEqual(error, failure)
        assert.isFalse(Runtime.getErrorReported(error))
        const stderr = yield* TestConsole.errorLines
        assert.lengthOf(stderr, 1)
        assert.strictEqual(String(stderr[0]), "\nERROR\n  Deployment failed")
        assert.isEmpty(yield* TestConsole.logLines)
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should render UserError handler failures with the installed formatter", () =>
      Effect.gen(function*() {
        const formatter: CliOutput.Formatter = {
          ...CliOutput.defaultFormatter({ colors: false }),
          formatError: (error) => `CUSTOM ERROR: ${error.message}`
        }
        const failure = new CliError.UserError({ cause: "Deployment failed" })
        const command = Command.make("deploy", {}, () => failure)

        yield* Command.runWith(command, { version: "1.0.0" })([]).pipe(
          Effect.flip,
          Effect.provide(TestLayerWithoutFormatter),
          Effect.provideService(CliOutput.Formatter, formatter)
        )

        assert.deepStrictEqual(yield* TestConsole.errorLines, ["CUSTOM ERROR: Deployment failed"])
      }))

    it.effect("should render UserError once when running wizard-generated arguments", () =>
      Effect.gen(function*() {
        const failure = new CliError.UserError({ cause: "Deployment failed" })
        const command = Command.make("deploy", {}, () => failure)

        const fiber = yield* Command.runWith(command, { version: "1.0.0" })(["--wizard"]).pipe(
          Effect.flip,
          Effect.forkChild
        )
        yield* MockTerminal.inputKey("enter")
        const error = yield* Fiber.join(fiber)

        assert.strictEqual(error, failure)
        assert.deepStrictEqual(yield* TestConsole.errorLines, ["\nERROR\n  Deployment failed"])
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should render UserError argument failures with command help", () =>
      Effect.gen(function*() {
        const command = Command.make("deploy", {
          target: Argument.String("target").pipe(
            Argument.mapEffect(() =>
              Effect.fail(
                new CliError.UserError({
                  cause: "Invalid deployment target"
                })
              )
            )
          )
        })

        const error = yield* Effect.flip(Command.runWith(command, { version: "1.0.0" })(["invalid"]))

        assert.instanceOf(error, CliError.ShowHelp)
        assert.include((yield* TestConsole.errorLines).join("\n"), "Invalid deployment target")
        assert.include((yield* TestConsole.logLines).join("\n"), "USAGE")
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should suppress automatic error rendering", () =>
      Effect.gen(function*() {
        const userError = new CliError.UserError({ cause: "Deployment failed" })
        const command = Command.make("deploy", {}, () => userError)
        const config = { version: "1.0.0", renderErrors: false } as const

        const handlerFailure = yield* Effect.flip(Command.runWith(command, config)([]))
        const parseFailure = yield* Effect.flip(Command.runWith(command, config)(["--unknown"]))

        assert.strictEqual(handlerFailure, userError)
        assert.isTrue(Runtime.getErrorReported(handlerFailure))
        assert.instanceOf(parseFailure, CliError.ShowHelp)
        assert.isEmpty(yield* TestConsole.errorLines)
        assert.include((yield* TestConsole.logLines).join("\n"), "USAGE")
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should still render help when automatic error rendering is disabled", () =>
      Effect.gen(function*() {
        const child = Command.make("child")
        const command = Command.make("app").pipe(Command.withSubcommands([child]))

        const error = yield* Effect.flip(
          Command.runWith(command, { version: "1.0.0", renderErrors: false })([])
        )

        assert.instanceOf(error, CliError.ShowHelp)
        assert.isEmpty(error.errors)
        assert.include((yield* TestConsole.logLines).join("\n"), "USAGE")
        assert.isEmpty(yield* TestConsole.errorLines)
      }).pipe(Effect.provide(TestLayer)))
  })

  describe("withSubcommands", () => {
    it("preserves unlisted metadata when adding subcommands", () => {
      const withChild = Command.make("internal").pipe(
        Command.unlisted,
        Command.withSubcommands([Command.make("child")])
      )

      assert.isTrue(withChild.unlisted)
    })

    it("preserves unlisted metadata when adding shared flags", () => {
      const withShared = Command.make("internal").pipe(
        Command.unlisted,
        Command.withSharedFlags({ verbose: Flag.Boolean("verbose") })
      )

      assert.isTrue(withShared.unlisted)
    })

    it.effect("should execute parent handler when no subcommand provided", () =>
      Effect.gen(function*() {
        const command = "git"

        yield* Cli.run([command, "--verbose"])

        const actions = yield* TestActions.getActions
        assert.strictEqual(actions.length, 1)
        assert.deepStrictEqual(actions[0], { command, details: { verbose: true } })
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should execute subcommand when provided", () =>
      Effect.gen(function*() {
        const command = ["git", "clone"]
        const repository = "myrepo"
        const branch = "develop"

        yield* Cli.run([...command, repository, "--branch", branch])

        const actions = yield* TestActions.getActions
        assert.strictEqual(actions.length, 1)
        assert.deepStrictEqual(actions[0], {
          command: command.join(" "),
          details: { repository, branch }
        })
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should execute subcommand when provided by alias", () =>
      Effect.gen(function*() {
        const executed: Array<string> = []

        const plan = Command.make("plan", {}, () => Effect.sync(() => executed.push("plan"))).pipe(
          Command.withAlias("p")
        )
        const root = Command.make("tool").pipe(Command.withSubcommands([plan]))
        const runRoot = Command.runWith(root, { version: "1.0.0" })

        yield* runRoot(["p"])

        assert.deepStrictEqual(executed, ["plan"])
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should accept grouped and ungrouped subcommands", () =>
      Effect.gen(function*() {
        const executed: Array<string> = []

        const root = Command.make("tool")
        const login = Command.make("login", {}, () => Effect.sync(() => executed.push("login")))
        const logout = Command.make("logout", {}, () => Effect.sync(() => executed.push("logout")))
        const status = Command.make("status", {}, () => Effect.sync(() => executed.push("status")))

        const cli = root.pipe(Command.withSubcommands([
          {
            group: "Auth commands",
            commands: [login, logout]
          },
          status
        ]))

        const runCli = Command.runWith(cli, { version: "1.0.0" })

        yield* runCli(["login"])
        yield* runCli(["status"])

        assert.deepStrictEqual(executed, ["login", "status"])
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should handle multiple subcommands correctly", () =>
      Effect.gen(function*() {
        yield* Cli.run(["git", "clone", "repo1"])
        yield* Cli.run(["git", "add", "file1", "--update"])
        yield* Cli.run(["git", "status", "--short"])

        const actions = yield* TestActions.getActions
        assert.strictEqual(actions.length, 3)
        assert.deepStrictEqual(actions[0], {
          command: "git clone",
          details: { repository: "repo1", branch: "main" }
        })
        assert.deepStrictEqual(actions[1], {
          command: "git add",
          details: { files: "file1", update: true }
        })
        assert.deepStrictEqual(actions[2], {
          command: "git status",
          details: { short: true }
        })
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should handle nested config structures in subcommands", () =>
      Effect.gen(function*() {
        const service = "api-service"
        const environment = "production"
        const dbHost = "localhost"
        const dbPort = 5432

        yield* Cli.run([
          "app",
          "--env",
          "prod",
          "deploy",
          service,
          environment,
          "--db-host",
          dbHost,
          "--db-port",
          dbPort.toString(),
          "--dry-run"
        ])

        const actions = yield* TestActions.getActions
        assert.strictEqual(actions.length, 1)
        assert.deepStrictEqual(actions[0], {
          command: "deploy",
          details: {
            service,
            environment,
            database: { host: dbHost, port: dbPort },
            dryRun: true
          }
        })
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should execute parent handler with options when no subcommand provided", () =>
      Effect.gen(function*() {
        // Use git command with only --verbose flag (git doesn't have an "unknown" option)
        // This will execute the parent git handler instead of trying to match subcommands
        yield* Cli.run(["git", "--verbose"])

        const actions = yield* TestActions.getActions
        assert.strictEqual(actions.length, 1)
        assert.deepStrictEqual(actions[0], {
          command: "git",
          details: { verbose: true }
        })
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should propagate subcommand errors", () =>
      Effect.gen(function*() {
        const result = yield* Effect.flip(Cli.run(["test-failing", "--input", "test"]))
        assert.strictEqual(result, "Handler error")
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should provide shared parent context to subcommands", () =>
      Effect.gen(function*() {
        const messages: Array<string> = []

        const parent = Command.make("parent").pipe(
          Command.withSharedFlags({
            verbose: Flag.Boolean("verbose"),
            config: Flag.String("config")
          })
        )

        // Create subcommand that accesses parent context
        const child = Command.make("child", { action: Flag.String("action") }, (config) =>
          Effect.gen(function*() {
            const parentConfig = yield* parent
            messages.push(`child: parent.verbose=${parentConfig.verbose}`)
            messages.push(`child: parent.config=${parentConfig.config}`)
            messages.push(`child: action=${config.action}`)
          }))

        const combined = parent.pipe(Command.withSubcommands([child]))

        const runCommand = Command.runWith(combined, {
          version: "1.0.0"
        })

        yield* runCommand([
          "--verbose",
          "--config",
          "prod.json",
          "child",
          "--action",
          "deploy"
        ])

        assert.deepStrictEqual(messages, [
          "child: parent.verbose=true",
          "child: parent.config=prod.json",
          "child: action=deploy"
        ])
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should accept shared parent flags before or after a subcommand (npm-style)", () =>
      Effect.gen(function*() {
        const messages: Array<string> = []

        const root = Command.make("npm").pipe(
          Command.withSharedFlags({
            global: Flag.Boolean("global")
          })
        )

        const install = Command.make("install", {
          pkg: Flag.String("pkg")
        }, (config) =>
          Effect.gen(function*() {
            const parentConfig = yield* root
            messages.push(`install: global=${parentConfig.global}, pkg=${config.pkg}`)
          }))

        const npm = root.pipe(Command.withSubcommands([install]))

        const runNpm = Command.runWith(npm, { version: "1.0.0" })

        yield* runNpm(["--global", "install", "--pkg", "cowsay"])
        yield* runNpm(["install", "--pkg", "cowsay", "--global"])

        assert.deepStrictEqual(messages, [
          "install: global=true, pkg=cowsay",
          "install: global=true, pkg=cowsay"
        ])
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should parse shared flags for parent handlers", () =>
      Effect.gen(function*() {
        const messages: Array<string> = []

        const root = Command.make("tool", {
          workspace: Flag.String("workspace")
        }).pipe(
          Command.withSharedFlags({
            model: Flag.String("model")
          }),
          Command.withHandler((config) =>
            Effect.sync(() => {
              messages.push(`root: workspace=${config.workspace}, model=${config.model}`)
            })
          )
        )

        const runRoot = Command.runWith(root, { version: "1.0.0" })
        yield* runRoot(["--workspace", "docs", "--model", "gpt-4o"])

        assert.deepStrictEqual(messages, ["root: workspace=docs, model=gpt-4o"])
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should allow child flags to reuse parent local flag names", () =>
      Effect.gen(function*() {
        const messages: Array<string> = []

        const root = Command.make("tool", {
          model: Flag.String("model")
        }).pipe(
          Command.withSharedFlags({
            workspace: Flag.String("workspace")
          })
        )

        const chat = Command.make("chat", {
          model: Flag.String("model")
        }, (config) =>
          Effect.gen(function*() {
            const parent = yield* root
            messages.push(`chat: workspace=${parent.workspace}, model=${config.model}`)
          }))

        const cli = root.pipe(Command.withSubcommands([chat]))
        const runCli = Command.runWith(cli, { version: "1.0.0" })

        yield* runCli(["--workspace", "docs", "chat", "--model", "gpt-4o-mini"])

        assert.deepStrictEqual(messages, ["chat: workspace=docs, model=gpt-4o-mini"])
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should reject parent local flags on subcommand paths", () =>
      Effect.gen(function*() {
        const root = Command.make("tool", {
          model: Flag.String("model")
        }).pipe(
          Command.withSharedFlags({
            workspace: Flag.String("workspace")
          })
        )

        const chat = Command.make("chat", {
          topic: Flag.String("topic")
        })

        const cli = root.pipe(Command.withSubcommands([chat]))
        const runCli = Command.runWith(cli, { version: "1.0.0" })

        yield* runCli(["--workspace", "docs", "--model", "gpt-4o", "chat", "--topic", "bugs"]).pipe(
          Effect.catchTag("ShowHelp", () => Effect.void)
        )

        const stderr = yield* TestConsole.errorLines
        const text = stderr.join("\n")
        assert.isTrue(text.includes("Unrecognized flag: --model in command tool chat"))
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should allow direct accessing parent config in subcommands", () =>
      Effect.gen(function*() {
        const messages: Array<string> = []

        const root = Command.make("npm").pipe(
          Command.withSharedFlags({
            global: Flag.Boolean("global")
          })
        )

        const install = Command.make("install", {
          pkg: Flag.String("pkg")
        }, (config) =>
          Effect.gen(function*() {
            const parentConfig = yield* root
            messages.push(`install: global=${parentConfig.global}, pkg=${config.pkg}`)
          }))

        const npm = root.pipe(Command.withSubcommands([install]))

        const runNpm = Command.runWith(npm, { version: "1.0.0" })
        yield* runNpm(["--global", "install", "--pkg", "effect"])

        assert.deepStrictEqual(messages, [
          "install: global=true, pkg=effect"
        ])
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should handle nested subcommands with context sharing", () =>
      Effect.gen(function*() {
        const messages: Array<string> = []

        const root = Command.make("app").pipe(
          Command.withSharedFlags({
            env: Flag.String("env")
          }),
          Command.withHandler((config) =>
            Effect.gen(function*() {
              messages.push(`root: env=${config.env}`)
            })
          )
        )

        const service = Command.make("service").pipe(
          Command.withSharedFlags({
            name: Flag.String("name")
          }),
          Command.withHandler((config) =>
            Effect.gen(function*() {
              const rootConfig = yield* root
              messages.push(`service: root.env=${rootConfig.env}`)
              messages.push(`service: name=${config.name}`)
            })
          )
        )

        const deploy = Command.make("deploy", {
          targetVersion: Flag.String("target-version")
        }, (config) =>
          Effect.gen(function*() {
            const rootConfig = yield* root
            const serviceConfig = yield* service
            messages.push(`deploy: root.env=${rootConfig.env}`)
            messages.push(`deploy: service.name=${serviceConfig.name}`)
            messages.push(`deploy: target-version=${config.targetVersion}`)
          }))

        const serviceWithDeploy = service.pipe(
          Command.withSubcommands([deploy])
        )

        const appWithService = root.pipe(
          Command.withSubcommands([serviceWithDeploy])
        )

        const runCommand = Command.runWith(appWithService, { version: "1.0.0" })
        yield* runCommand([
          "--env",
          "production",
          "service",
          "--name",
          "api",
          "deploy",
          "--target-version",
          "1.0.0"
        ])

        assert.deepStrictEqual(messages, [
          "deploy: root.env=production",
          "deploy: service.name=api",
          "deploy: target-version=1.0.0"
        ])
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should handle boolean shared flags before subcommands", () =>
      Effect.gen(function*() {
        const messages: Array<string> = []

        const parent = Command.make("app").pipe(
          Command.withSharedFlags({
            verbose: Flag.Boolean("verbose"),
            config: Flag.String("config")
          }),
          Command.withHandler((config) =>
            Effect.gen(function*() {
              messages.push(`parent: verbose=${config.verbose}, config=${config.config}`)
            })
          )
        )

        const deploy = Command.make("deploy", {
          targetVersion: Flag.String("target-version")
        }, (config) =>
          Effect.gen(function*() {
            const parentConfig = yield* parent
            messages.push(`deploy: parent.verbose=${parentConfig.verbose}`)
            messages.push(`deploy: target-version=${config.targetVersion}`)
          }))

        const combined = parent.pipe(
          Command.withSubcommands([deploy])
        )

        const runCommand = Command.runWith(combined, { version: "1.0.0" })
        yield* runCommand([
          "--config",
          "prod.json",
          "--verbose",
          "deploy",
          "--target-version",
          "1.0.0"
        ])

        assert.deepStrictEqual(messages, [
          "deploy: parent.verbose=true",
          "deploy: target-version=1.0.0"
        ])
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should merge stacked withSharedFlags calls", () =>
      Effect.gen(function*() {
        const messages: Array<string> = []

        const root = Command.make("tool", {
          dryRun: Flag.Boolean("dry-run")
        }).pipe(
          Command.withSharedFlags({
            verbose: Flag.Boolean("verbose")
          }),
          Command.withSharedFlags({
            format: Flag.String("format")
          })
        )

        const child = Command.make("run", {}, () =>
          Effect.gen(function*() {
            const parent = yield* root
            messages.push(`verbose=${parent.verbose}, format=${parent.format}`)
          }))

        const cli = root.pipe(Command.withSubcommands([child]))
        const runCli = Command.runWith(cli, { version: "1.0.0" })

        yield* runCli(["--verbose", "--format", "json", "run"])

        assert.deepStrictEqual(messages, ["verbose=true, format=json"])
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should work with Command.provide when shared flags are present", () =>
      Effect.gen(function*() {
        const messages: Array<string> = []

        const DbUrl = Context.Service<never, string>("effect/test/unstable/cli/DbUrl")

        const root = Command.make("app", {
          dryRun: Flag.Boolean("dry-run")
        }).pipe(
          Command.withSharedFlags({
            env: Flag.String("env")
          })
        )

        const deploy = Command.make("deploy", {}, () =>
          Effect.gen(function*() {
            const parent = yield* root
            const dbUrl = yield* DbUrl
            messages.push(`env=${parent.env}, db=${dbUrl}`)
          }))

        const cli = root.pipe(
          Command.withSubcommands([deploy]),
          Command.provideSync(DbUrl, (input) => `db://${input.env}.example.com`)
        )

        const runCli = Command.runWith(cli, { version: "1.0.0" })
        yield* runCli(["--env", "production", "deploy"])

        assert.deepStrictEqual(messages, ["env=production, db=db://production.example.com"])
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should reject shared/child flag collisions when withSharedFlags is applied after withSubcommands", () =>
      Effect.sync(() => {
        const child = Command.make("run", {
          verbose: Flag.Boolean("verbose")
        })

        assert.throws(() =>
          Command.make("tool").pipe(
            Command.withSubcommands([child]),
            Command.withSharedFlags({
              verbose: Flag.Boolean("verbose")
            })
          )
        )
      }))

    it.effect("should require withSharedFlags before withSubcommands for subcommand access", () =>
      Effect.gen(function*() {
        const messages: Array<string> = []

        // withSharedFlags BEFORE withSubcommands — correct ordering
        const root = Command.make("tool").pipe(
          Command.withSharedFlags({
            verbose: Flag.Boolean("verbose")
          })
        )

        const child = Command.make("run", {}, () =>
          Effect.gen(function*() {
            const parent = yield* root
            messages.push(`verbose=${parent.verbose}`)
          }))

        const cli = root.pipe(
          Command.withSubcommands([child])
        )

        const runCli = Command.runWith(cli, { version: "1.0.0" })
        yield* runCli(["--verbose", "run"])

        assert.deepStrictEqual(messages, ["verbose=true"])
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should treat tokens after -- as operands (no subcommand or flags)", () =>
      Effect.gen(function*() {
        const captured: Array<ReadonlyArray<string>> = []
        let childInvoked = false

        const root = Command.make("tool", {
          rest: Argument.String("rest").pipe(Argument.variadic())
        }, (config) =>
          Effect.sync(() => {
            captured.push(config.rest)
          }))

        const child = Command.make("child", {
          value: Flag.String("value")
        }, () =>
          Effect.sync(() => {
            childInvoked = true
          }))

        const cli = root.pipe(Command.withSubcommands([child]))
        const runCli = Command.runWith(cli, { version: "1.0.0" })

        yield* runCli(["--", "child", "--value", "x"])

        assert.isFalse(childInvoked)
        assert.deepStrictEqual(captured, [["child", "--value", "x"]])
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should pass trailing operands to the selected subcommand", () =>
      Effect.gen(function*() {
        const captured: Array<ReadonlyArray<string>> = []

        const child = Command.make("child", {
          values: Argument.String("value").pipe(Argument.variadic())
        }, ({ values }) => Effect.sync(() => captured.push(values)))

        const cli = Command.make("tool").pipe(Command.withSubcommands([child]))

        yield* Command.runWith(cli, { version: "1.0.0" })([
          "child",
          "--",
          "value",
          "--literal",
          "-x"
        ])

        assert.deepStrictEqual(captured, [["value", "--literal", "-x"]])
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should pass trailing operands through nested subcommands", () =>
      Effect.gen(function*() {
        const captured: Array<string> = []

        const child = Command.make("child", {
          value: Argument.String("value")
        }, ({ value }) => Effect.sync(() => captured.push(value)))
        const group = Command.make("group").pipe(Command.withSubcommands([child]))
        const cli = Command.make("tool").pipe(Command.withSubcommands([group]))

        yield* Command.runWith(cli, { version: "1.0.0" })(["group", "child", "--", "-literal"])

        assert.deepStrictEqual(captured, ["-literal"])
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should allow no trailing operands after -- for a subcommand", () =>
      Effect.gen(function*() {
        let invoked = false

        const child = Command.make("child", {}, () =>
          Effect.sync(() => {
            invoked = true
          }))
        const cli = Command.make("tool").pipe(Command.withSubcommands([child]))

        yield* Command.runWith(cli, { version: "1.0.0" })(["child", "--"])

        assert.isTrue(invoked)
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should preserve trailing operands for a leaf command", () =>
      Effect.gen(function*() {
        const captured: Array<ReadonlyArray<string>> = []

        const command = Command.make("tool", {
          values: Argument.String("value").pipe(Argument.variadic())
        }, ({ values }) => Effect.sync(() => captured.push(values)))

        yield* Command.runWith(command, { version: "1.0.0" })(["--", "--literal", "-x"])

        assert.deepStrictEqual(captured, [["--literal", "-x"]])
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should preserve inherited flags around a subcommand with trailing operands", () =>
      Effect.gen(function*() {
        const captured: Array<{ before: boolean; after: boolean; value: string }> = []

        const root = Command.make("tool").pipe(
          Command.withSharedFlags({
            before: Flag.Boolean("before"),
            after: Flag.Boolean("after")
          })
        )
        const child = Command.make("child", {
          value: Argument.String("value")
        }, ({ value }) =>
          Effect.gen(function*() {
            const parent = yield* root
            captured.push({ before: parent.before, after: parent.after, value })
          }))
        const cli = root.pipe(Command.withSubcommands([child]))

        yield* Command.runWith(cli, { version: "1.0.0" })([
          "--before",
          "child",
          "--after",
          "--",
          "-literal"
        ])

        assert.deepStrictEqual(captured, [{ before: true, after: true, value: "-literal" }])
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should coerce boolean flags to false when given falsey literals", () =>
      Effect.gen(function*() {
        const captured: Array<boolean> = []

        const cmd = Command.make("tool", {
          verbose: Flag.Boolean("verbose")
        }, (config) => Effect.sync(() => captured.push(config.verbose)))

        const runCmd = Command.runWith(cmd, { version: "1.0.0" })

        yield* runCmd(["--verbose", "false"])
        yield* runCmd(["--verbose", "0"])

        assert.deepStrictEqual(captured, [false, false])
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should parse required boolean flags when explicitly enabled or disabled", () =>
      Effect.gen(function*() {
        const captured: Array<boolean> = []

        const cmd = Command.make("tool", {
          verbose: Flag.Boolean("verbose")
        }, (config) => Effect.sync(() => captured.push(config.verbose)))

        const runCmd = Command.runWith(cmd, { version: "1.0.0" })

        yield* runCmd(["--verbose"])
        yield* runCmd(["--no-verbose"])

        assert.deepStrictEqual(captured, [true, false])
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should support optional boolean flags and --no-<flag> negation", () =>
      Effect.gen(function*() {
        const captured: Array<Option.Option<boolean>> = []

        const cmd = Command.make("tool", {
          open: Flag.Boolean("open").pipe(Flag.optional)
        }, (config) => Effect.sync(() => captured.push(config.open)))

        const runCmd = Command.runWith(cmd, { version: "1.0.0" })

        yield* runCmd([])
        yield* runCmd(["--open"])
        yield* runCmd(["--no-open"])

        assert.deepStrictEqual(captured, [
          Option.none(),
          Option.some(true),
          Option.some(false)
        ])
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should prefer canonical negation over conflicting aliases", () =>
      Effect.gen(function*() {
        const captured: Array<readonly [boolean, boolean]> = []

        const cmd = Command.make("tool", {
          prompt: Flag.Boolean("prompt"),
          force: Flag.Boolean("force").pipe(
            Flag.withAlias("no-prompt"),
            Flag.withDefault(false)
          )
        }, (config) => Effect.sync(() => captured.push([config.prompt, config.force] as const)))

        const runCmd = Command.runWith(cmd, { version: "1.0.0" })

        yield* runCmd(["--no-prompt"])

        assert.deepStrictEqual(captured, [[false, false]])
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should reject explicit values for canonical negated flags", () =>
      Effect.gen(function*() {
        let invoked = false

        const cmd = Command.make("tool", {
          open: Flag.Boolean("open")
        }, () =>
          Effect.sync(() => {
            invoked = true
          }))

        const runCmd = Command.runWith(cmd, { version: "1.0.0" })

        yield* runCmd(["--no-open", "false"]).pipe(Effect.catchTag("ShowHelp", () => Effect.void))
        yield* runCmd(["--no-open=true"]).pipe(Effect.catchTag("ShowHelp", () => Effect.void))

        assert.isFalse(invoked)

        const stderr = yield* TestConsole.errorLines
        assert.isTrue(stderr.join("\n").includes("use --no-open by itself to set --open to false"))
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should not leak a negated flag literal into subcommand parsing", () =>
      Effect.gen(function*() {
        let parentInvoked = false
        let childInvoked = false

        const child = Command.make("child", {}, () =>
          Effect.sync(() => {
            childInvoked = true
          }))

        const root = Command.make("tool", {
          open: Flag.Boolean("open")
        }, () =>
          Effect.sync(() => {
            parentInvoked = true
          })).pipe(Command.withSubcommands([child]))

        const runCmd = Command.runWith(root, { version: "1.0.0" })

        yield* runCmd(["--no-open", "false", "child"]).pipe(Effect.catchTag("ShowHelp", () => Effect.void))

        assert.isFalse(parentInvoked)
        assert.isFalse(childInvoked)

        const stderr = yield* TestConsole.errorLines
        const output = stderr.join("\n")
        assert.isTrue(output.includes("use --no-open by itself to set --open to false"))
        assert.isFalse(output.includes("Unknown subcommand \"false\""))
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should fail when a required flag value is missing", () =>
      Effect.gen(function*() {
        let invoked = false

        const cmd = Command.make("tool", {
          pkg: Flag.String("pkg")
        }, () =>
          Effect.sync(() => {
            invoked = true
          }))

        const runCmd = Command.runWith(cmd, { version: "1.0.0" })

        yield* runCmd(["--pkg"]).pipe(Effect.catchTag("ShowHelp", () => Effect.void))

        assert.isFalse(invoked)
        const stderr = yield* TestConsole.errorLines
        assert.isAbove(stderr.length, 0)
        assert.isTrue(stderr.join("\n").includes("--pkg"))
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should parse combined short flags including one that expects a value", () =>
      Effect.gen(function*() {
        const captured: Array<{ all: boolean; verbose: boolean; pkg: string }> = []

        const cmd = Command.make("tool", {
          all: Flag.Boolean("all").pipe(Flag.withAlias("a")),
          verbose: Flag.Boolean("verbose").pipe(Flag.withAlias("v")),
          pkg: Flag.String("pkg").pipe(Flag.withAlias("p"))
        }, (config) =>
          Effect.sync(() => {
            captured.push(config)
          }))

        const runCmd = Command.runWith(cmd, { version: "1.0.0" })

        yield* runCmd(["-avp", "cowsay"])

        assert.deepStrictEqual(captured, [{ all: true, verbose: true, pkg: "cowsay" }])
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should honor -- while still applying parent flags", () =>
      Effect.gen(function*() {
        const captured: Array<{ global: boolean; rest: ReadonlyArray<string> }> = []

        const root = Command.make("tool", {
          global: Flag.Boolean("global"),
          rest: Argument.String("rest").pipe(Argument.variadic())
        }, (config) => Effect.sync(() => captured.push({ global: config.global, rest: config.rest })))

        const child = Command.make("child", {
          value: Flag.String("value")
        })

        const cli = root.pipe(Command.withSubcommands([child]))
        const runCli = Command.runWith(cli, { version: "1.0.0" })

        yield* runCli(["--global", "--", "child", "--value", "x"])

        assert.deepStrictEqual(captured, [{ global: true, rest: ["child", "--value", "x"] }])
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should report unknown flag even when subcommand is unknown", () =>
      Effect.gen(function*() {
        const root = Command.make("root", {})
        const known = Command.make("known", {})
        const cli = root.pipe(Command.withSubcommands([known]))
        const runCli = Command.runWith(cli, { version: "1.0.0" })

        yield* runCli(["--unknown", "bogus"]).pipe(Effect.catchTag("ShowHelp", () => Effect.void))

        const stderr = yield* TestConsole.errorLines
        const text = stderr.join("\n")
        assert.isTrue(text.includes("Unrecognized flag: --unknown"))
        // Parser may also surface the unknown subcommand; ensure at least one error is emitted.
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should keep variadic argument order when options are interleaved", () =>
      Effect.gen(function*() {
        const captured: Array<{ files: ReadonlyArray<string>; verbose: boolean }> = []

        const cmd = Command.make("copy", {
          verbose: Flag.Boolean("verbose"),
          files: Argument.String("file").pipe(Argument.variadic())
        }, (config) => Effect.sync(() => captured.push({ files: config.files, verbose: config.verbose })))

        const runCmd = Command.runWith(cmd, { version: "1.0.0" })

        yield* runCmd(["--verbose", "a.txt", "b.txt", "--verbose", "c.txt"])

        assert.deepStrictEqual(captured, [{ files: ["a.txt", "b.txt", "c.txt"], verbose: true }])
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should support options before, after, or between operands (relaxed POSIX Syntax Guideline No. 9)", () =>
      Effect.gen(function*() {
        // Test both orderings work: POSIX (options before operands) and modern (mixed)

        // Test 1: POSIX style - options before operands
        yield* Cli.run([
          "copy",
          "--recursive",
          "--force",
          "src.txt",
          "dest.txt"
        ])

        // Test 2: Modern style - options after operands
        yield* Cli.run([
          "copy",
          "src.txt",
          "dest.txt",
          "--recursive",
          "--force"
        ])

        // Test 3: Mixed style - some options before, some after
        yield* Cli.run([
          "copy",
          "--recursive",
          "src.txt",
          "dest.txt",
          "--force"
        ])

        // Check all three commands worked
        const actions = yield* TestActions.getActions
        assert.strictEqual(actions.length, 3)

        for (let i = 0; i < 3; i++) {
          assert.strictEqual(actions[i].command, "copy")
          assert.strictEqual(actions[i].details.recursive, true)
          assert.strictEqual(actions[i].details.force, true)
          assert.strictEqual(actions[i].details.bufferSize, 64)
          // Source and destination will be resolved paths - just check they contain the filenames
          assert.isTrue(String(actions[i].details.source).includes("src.txt"))
          assert.isTrue(String(actions[i].details.destination).includes("dest.txt"))
        }
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should suggest similar subcommands for unknown subcommands", () =>
      Effect.gen(function*() {
        yield* Cli.run(["cpy"]).pipe(Effect.catchTag("ShowHelp", () => Effect.void))

        const errorOutput = yield* TestConsole.errorLines
        const errorText = errorOutput.join("\n")
        expect(errorText).toMatchInlineSnapshot(`
          "
          ERROR
            Unknown subcommand "cpy" for "mycli"

            Did you mean this?
              copy"
        `)
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should suggest similar subcommands for nested unknown subcommands", () =>
      Effect.gen(function*() {
        yield* Cli.run(["admin", "usrs", "list"]).pipe(Effect.catchTag("ShowHelp", () => Effect.void))

        // Capture the error output
        const errorOutput = yield* TestConsole.errorLines
        const errorText = errorOutput.join("\n")
        expect(errorText).toMatchInlineSnapshot(`
          "
          ERROR
            Unknown subcommand "usrs" for "mycli admin"

            Did you mean this?
              users"
        `)
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should suggest similar options for unrecognized options", () =>
      Effect.gen(function*() {
        yield* Cli.run(["--debugs", "copy", "src.txt", "dest.txt"]).pipe(Effect.catchTag("ShowHelp", () => Effect.void))

        const errorOutput = yield* TestConsole.errorLines
        const errorText = errorOutput.join("\n")
        expect(errorText).toMatchInlineSnapshot(`
          "
          ERROR
            Unrecognized flag: --debugs in command mycli

            Did you mean this?
              --debug"
        `)
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should suggest similar short options for unrecognized short options", () =>
      Effect.gen(function*() {
        yield* Cli.run(["-u", "copy", "src.txt", "dest.txt"]).pipe(Effect.catchTag("ShowHelp", () => Effect.void))

        const errorOutput = yield* TestConsole.errorLines
        const errorText = errorOutput.join("\n")
        expect(errorText).toMatchInlineSnapshot(`
          "
          ERROR
            Unrecognized flag: -u in command mycli

            Did you mean this?
              -d
              -c
              -q"
        `)
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should print version and exit even with subcommands (global precedence)", () =>
      Effect.gen(function*() {
        // --version should work on a command with subcommands
        yield* Cli.run(["--version"])

        const output = yield* TestConsole.logLines
        const outputText = output.join("\n")
        expect(outputText).toContain("1.0.0")
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should print version and exit when --version appears before subcommand", () =>
      Effect.gen(function*() {
        // --version should take precedence over subcommand
        yield* Cli.run(["--version", "copy", "src.txt", "dest.txt"])

        const output = yield* TestConsole.logLines
        const outputText = output.join("\n")
        expect(outputText).toContain("1.0.0")

        // Subcommand should NOT have run
        const actions = yield* TestActions.getActions
        assert.strictEqual(actions.length, 0)
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should let global flags before subcommands override non-shared parent locals", () =>
      Effect.gen(function*() {
        const captured: Array<boolean> = []
        let childInvoked = false
        const child = Command.make("child", {}, () =>
          Effect.sync(() => {
            childInvoked = true
          }))
        const command = Command.make("tool", {
          version: Flag.Boolean("version")
        }, (config) =>
          Effect.sync(() => {
            captured.push(config.version)
          })).pipe(Command.withSubcommands([child]))

        const runCommand = Command.runWith(command, { version: "1.0.0" })
        yield* runCommand(["--version", "child"])

        assert.deepStrictEqual(captured, [])
        assert.isFalse(childInvoked)

        const output = yield* TestConsole.logLines
        assert.isTrue(output.some((line) => String(line).includes("1.0.0")))
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should keep shared flags before subcommands over globals", () =>
      Effect.gen(function*() {
        const captured: Array<boolean> = []
        const root = Command.make("tool", {}, () => Effect.void).pipe(
          Command.withSharedFlags({
            version: Flag.Boolean("version")
          })
        )
        const child = Command.make("child", {}, () =>
          Effect.gen(function*() {
            const parent = yield* root
            captured.push(parent.version)
          }))
        const command = root.pipe(Command.withSubcommands([child]))

        const runCommand = Command.runWith(command, { version: "1.0.0" })
        yield* runCommand(["--version", "child"])

        assert.deepStrictEqual(captured, [true])

        const output = yield* TestConsole.logLines
        assert.isFalse(output.some((line) => String(line).includes("1.0.0")))

        yield* runCommand(["child", "--version"])

        assert.deepStrictEqual(captured, [true, true])
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should keep root local flags over globals when no subcommand is selected", () =>
      Effect.gen(function*() {
        const captured: Array<string> = []
        const child = Command.make("child", {}, () => Effect.void)
        const command = Command.make("tool", {
          version: Flag.String("version")
        }, (config) =>
          Effect.sync(() => {
            captured.push(config.version)
          })).pipe(Command.withSubcommands([child]))

        const runCommand = Command.runWith(command, { version: "1.0.0" })
        yield* runCommand(["--version", "canary"])

        assert.deepStrictEqual(captured, ["canary"])

        const output = yield* TestConsole.logLines
        assert.isFalse(output.some((line) => String(line).includes("1.0.0")))
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should skip intervening local flag values before selecting subcommands", () =>
      Effect.gen(function*() {
        const captured: Array<{ name: string; version: boolean }> = []
        let childInvoked = false
        const child = Command.make("child", {}, () =>
          Effect.sync(() => {
            childInvoked = true
          }))
        const command = Command.make("tool", {
          name: Flag.String("name"),
          version: Flag.Boolean("version")
        }, (config) =>
          Effect.sync(() => {
            captured.push(config)
          })).pipe(Command.withSubcommands([child]))

        const runCommand = Command.runWith(command, { version: "1.0.0" })
        yield* runCommand(["--version", "--name", "child"])

        assert.deepStrictEqual(captured, [{ name: "child", version: true }])
        assert.isFalse(childInvoked)

        const output = yield* TestConsole.logLines
        assert.isFalse(output.some((line) => String(line).includes("1.0.0")))
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should stop looking for subcommands after the first positional argument", () =>
      Effect.gen(function*() {
        const captured: Array<{ files: ReadonlyArray<string>; version: boolean }> = []
        let childInvoked = false
        const child = Command.make("child", {}, () =>
          Effect.sync(() => {
            childInvoked = true
          }))
        const command = Command.make("tool", {
          files: Argument.String("file").pipe(Argument.variadic()),
          version: Flag.Boolean("version")
        }, (config) =>
          Effect.sync(() => {
            captured.push(config)
          })).pipe(Command.withSubcommands([child]))

        const runCommand = Command.runWith(command, { version: "1.0.0" })
        yield* runCommand(["--version", "file", "child"])

        assert.deepStrictEqual(captured, [{ files: ["file", "child"], version: true }])
        assert.isFalse(childInvoked)

        const output = yield* TestConsole.logLines
        assert.isFalse(output.some((line) => String(line).includes("1.0.0")))
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should still select subcommands after skipped flag values", () =>
      Effect.gen(function*() {
        const captured: Array<{ name: string; version: boolean }> = []
        let childInvoked = false
        const child = Command.make("child", {}, () =>
          Effect.sync(() => {
            childInvoked = true
          }))
        const command = Command.make("tool", {
          name: Flag.String("name"),
          version: Flag.Boolean("version")
        }, (config) =>
          Effect.sync(() => {
            captured.push(config)
          })).pipe(Command.withSubcommands([child]))

        const runCommand = Command.runWith(command, { version: "1.0.0" })
        yield* runCommand(["--version", "--name", "value", "child"])

        assert.deepStrictEqual(captured, [])
        assert.isFalse(childInvoked)

        const output = yield* TestConsole.logLines
        assert.isTrue(output.some((line) => String(line).includes("1.0.0")))
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should let local flags override global flags on the selected command", () =>
      Effect.gen(function*() {
        const captured: Array<string> = []
        const release = Command.make("release", {
          version: Flag.String("version")
        }, (config) =>
          Effect.sync(() => {
            captured.push(config.version)
          }))
        const packageCommand = Command.make("package").pipe(Command.withSubcommands([release]))
        const command = Command.make("tool").pipe(Command.withSubcommands([packageCommand]))

        const runCommand = Command.runWith(command, { version: "1.0.0" })
        yield* runCommand(["package", "release", "--version", "canary"])

        assert.deepStrictEqual(captured, ["canary"])

        const output = yield* TestConsole.logLines
        assert.isFalse(output.some((line) => String(line).includes("1.0.0")))
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should let local short aliases override global short aliases on the selected command", () =>
      Effect.gen(function*() {
        const Output = GlobalFlag.Setting("output")({
          flag: Flag.Literals("output", ["pretty", "json", "yaml"] as const).pipe(
            Flag.withAlias("o"),
            Flag.withDefault("pretty")
          )
        })
        const captured: Array<"summary" | "json" | "csv"> = []
        const report = Command.make("report", {
          output: Flag.Literals("output", ["summary", "json", "csv"] as const).pipe(
            Flag.withAlias("o"),
            Flag.withDefault("summary")
          )
        }, (config) =>
          Effect.sync(() => {
            captured.push(config.output)
          }))
        const command = Command.make("tool").pipe(
          Command.withSubcommands([report]),
          Command.withGlobalFlags([Output])
        )

        const runCommand = Command.runWith(command, { version: "1.0.0" })
        yield* runCommand(["report", "-o", "csv"])

        assert.deepStrictEqual(captured, ["csv"])
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should let local flags override scoped global flags from another command branch", () =>
      Effect.gen(function*() {
        const Region = GlobalFlag.Setting("region")({
          flag: Flag.Literals("region", ["us", "eu"] as const).pipe(Flag.withDefault("us"))
        })
        const captured: Array<string> = []
        let deployInvoked = false
        const deploy = Command.make("deploy", {}, () =>
          Effect.sync(() => {
            deployInvoked = true
          })).pipe(Command.withGlobalFlags([Region]))
        const status = Command.make("status", {
          region: Flag.String("region")
        }, (config) =>
          Effect.sync(() => {
            captured.push(config.region)
          }))
        const command = Command.make("app").pipe(Command.withSubcommands([deploy, status]))

        const runCommand = Command.runWith(command, { version: "1.0.0" })
        yield* runCommand(["status", "--region", "local"])

        assert.deepStrictEqual(captured, ["local"])
        assert.isFalse(deployInvoked)
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should print help when invoked with no arguments", () =>
      Effect.gen(function*() {
        yield* Cli.run([]).pipe(Effect.catchTag("ShowHelp", () => Effect.void))

        // Check that help text was shown to stdout
        const stdout = yield* TestConsole.logLines
        assert.isTrue(stdout.some((line) => String(line).includes("DESCRIPTION")))
        assert.isTrue(stdout.some((line) => String(line).includes("comprehensive CLI tool")))

        // Handler should NOT have run
        const actions = yield* TestActions.getActions
        assert.strictEqual(actions.length, 0)
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should use short descriptions in subcommand listings", () =>
      Effect.gen(function*() {
        const withShortDescription = Command.make("build").pipe(
          Command.withDescription("Build the project and all artifacts"),
          Command.withShortDescription("Build artifacts")
        )
        const withFallbackDescription = Command.make("test").pipe(
          Command.withDescription("Run the full test suite")
        )
        const root = Command.make("tool").pipe(
          Command.withSubcommands([withShortDescription, withFallbackDescription])
        )

        const runCommand = Command.runWith(root, { version: "1.0.0" })
        yield* runCommand(["--help"])

        const stdout = (yield* TestConsole.logLines).join("\n")
        assert.isTrue(stdout.includes("Build artifacts"))
        assert.isFalse(stdout.includes("Build the project and all artifacts"))
        assert.isTrue(stdout.includes("Run the full test suite"))
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should keep full description on the command help page", () =>
      Effect.gen(function*() {
        const child = Command.make("build").pipe(
          Command.withDescription("Build the project and all artifacts"),
          Command.withShortDescription("Build artifacts")
        )
        const root = Command.make("tool").pipe(Command.withSubcommands([child]))
        const runCommand = Command.runWith(root, { version: "1.0.0" })

        yield* runCommand(["build", "--help"])

        const stdout = (yield* TestConsole.logLines).join("\n")
        assert.isTrue(stdout.includes("Build the project and all artifacts"))
      }).pipe(Effect.provide(TestLayer)))

    it.effect("should include short description metadata in HelpDoc subcommands", () =>
      Effect.gen(function*() {
        const child = Command.make("build").pipe(
          Command.withDescription("Build the project and all artifacts"),
          Command.withShortDescription("Build artifacts"),
          Command.withAlias("b")
        )
        const root = Command.make("tool").pipe(Command.withSubcommands([child]))

        const helpDoc = toImpl(root).buildHelpDoc(["tool"])
        const listed = helpDoc.subcommands?.[0]?.commands[0]

        assert.strictEqual(listed?.alias, "b")
        assert.strictEqual(listed?.shortDescription, "Build artifacts")
        assert.strictEqual(listed?.description, "Build the project and all artifacts")
      }))
  })

  describe("withExamples", () => {
    it.effect("should expose examples in help docs", () =>
      Effect.gen(function*() {
        const command = Command.make("login").pipe(
          Command.withExamples([
            { command: "myapp login", description: "Log in with browser OAuth" },
            { command: "myapp login --token sbp_abc123", description: "Log in with a token" }
          ])
        )

        const helpDoc = toImpl(command).buildHelpDoc(["login"])

        assert.deepStrictEqual(helpDoc.examples, [
          { command: "myapp login", description: "Log in with browser OAuth" },
          { command: "myapp login --token sbp_abc123", description: "Log in with a token" }
        ])
      }))

    it.effect("should preserve examples when adding subcommands", () =>
      Effect.gen(function*() {
        const root = Command.make("root").pipe(
          Command.withExamples([
            { command: "myapp root", description: "Run root command" }
          ]),
          Command.withSubcommands([Command.make("child")])
        )

        const helpDoc = toImpl(root).buildHelpDoc(["root"])

        assert.deepStrictEqual(helpDoc.examples, [
          { command: "myapp root", description: "Run root command" }
        ])
      }))
  })

  describe("help docs", () => {
    it.effect("should include flag choices in help doc descriptions", () =>
      Effect.gen(function*() {
        const command = Command.make("tool", {
          mode: Flag.Literals("mode", ["dev", "prod"]).pipe(
            Flag.withDescription("Execution mode")
          ),
          format: Flag.Literals("format", ["json", "yaml"])
        })

        const helpDoc = toImpl(command).buildHelpDoc(["tool"])

        assert.deepStrictEqual(helpDoc.flags, [
          {
            name: "mode",
            aliases: [],
            type: "choice",
            description: Option.some("Execution mode (choices: dev, prod)"),
            required: true
          },
          {
            name: "format",
            aliases: [],
            type: "choice",
            description: Option.some("(choices: json, yaml)"),
            required: true
          }
        ])
      }))

    it.effect("should render flag choices in formatted help output", () =>
      Effect.gen(function*() {
        const command = Command.make("tool", {
          mode: Flag.Literals("mode", ["dev", "prod"]).pipe(
            Flag.withDescription("Execution mode")
          )
        })
        const runCommand = Command.runWith(command, { version: "1.0.0" })

        yield* runCommand(["--help"])

        const stdout = (yield* TestConsole.logLines).join("\n")
        assert.isTrue(stdout.includes("Execution mode (choices: dev, prod)"))
      }).pipe(Effect.provide(TestLayer)))
  })
})
