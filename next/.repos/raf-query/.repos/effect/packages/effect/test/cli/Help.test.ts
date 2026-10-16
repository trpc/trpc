import { assert, describe, expect, it } from "@effect/vitest"
import { Effect, FileSystem, Layer, Path, Stdio } from "effect"
import { Argument, CliOutput, Command, Flag } from "effect/cli"
import { toImpl } from "effect/cli/internal/command"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
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
  Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, ChildProcessSpawner.make(() => Effect.die("Not implemented"))),
  Stdio.layerTest({})
)

const runCommand = Effect.fnUntraced(
  function*(command: ReadonlyArray<string>) {
    yield* Cli.run(command)
    const output = yield* TestConsole.logLines
    return output.join("\n")
  }
)

describe("Command help output", () => {
  it("marks omittable flags as not required in structured help", () => {
    const command = Command.make("app", {
      required: Flag.String("required"),
      optional: Flag.String("optional").pipe(Flag.optional),
      defaulted: Flag.String("defaulted").pipe(Flag.withDefault("output.txt"))
    })
    const help = toImpl(command).buildHelpDoc(["app"])

    assert.deepStrictEqual(help.flags.map((flag) => flag.required), [true, false, false])
  })

  it("marks omittable arguments as not required in structured help", () => {
    const requiredVariadic = Command.make("app", {
      files: Argument.String("files").pipe(Argument.variadic({ min: 1 }))
    })
    const optionalVariadic = Command.make("app", {
      files: Argument.String("files").pipe(Argument.variadic())
    })
    const defaulted = Command.make("app", {
      output: Argument.String("output").pipe(Argument.withDefault("output.txt"))
    })

    assert.deepStrictEqual(
      [
        toImpl(requiredVariadic).buildHelpDoc(["app"]).args![0].required,
        toImpl(optionalVariadic).buildHelpDoc(["app"]).args![0].required,
        toImpl(defaulted).buildHelpDoc(["app"]).args![0].required
      ],
      [true, false, false]
    )
  })

  it.effect("renders root command help", () =>
    Effect.gen(function*() {
      const helpText = yield* runCommand(["--help"])

      expect(helpText).toMatchInlineSnapshot(`
        "DESCRIPTION
          A comprehensive CLI tool demonstrating all features

        USAGE
          mycli <subcommand> [flags]

        FLAGS
          --debug, -d          Enable debug logging
          --config, -c file    Path to configuration file
          --quiet, -q          Suppress non-error output

        GLOBAL FLAGS
          --help, -h                                                          Show help information
          --version, -v                                                       Show version information
          --wizard                                                            Start wizard mode for a command
          --completions <bash|zsh|fish|sh>                                    Print shell completion script (choices: bash, zsh, fish, sh)
          --log-level <all|trace|debug|info|warn|warning|error|fatal|none>    Sets the minimum log level (choices: all, trace, debug, info, warn, warning, error, fatal, none)

        SUBCOMMANDS
          admin            Administrative commands
          copy             Copy files or directories
          move             Move or rename files
          remove           Remove files or directories
          build            Build the project
          git              Git version control
          test-required    Test command with required option
          test-failing     Test command that always fails
          app              Application management
          app-nested       Application with nested services"
      `)
    }).pipe(Effect.provide(TestLayer)))

  it.effect("aligns flag descriptions when flag names are long", () =>
    Effect.gen(function*() {
      const command = Command.make("tool", {
        short: Flag.String("short").pipe(Flag.withDescription("Short flag description")),
        veryLong: Flag.String("this-is-a-very-very-long-flag-name").pipe(
          Flag.withDescription("Long flag description")
        )
      })
      const run = Command.runWith(command, { version: "1.0.0" })

      yield* run(["--help"])

      const helpText = (yield* TestConsole.logLines).join("\n")
      const lines = helpText.split("\n")
      const shortLine = lines.find((line) => line.includes("--short"))
      const longLine = lines.find((line) => line.includes("--this-is-a-very-very-long-flag-name"))

      expect(shortLine).toBeDefined()
      expect(longLine).toBeDefined()
      expect(shortLine!.indexOf("Short flag description")).toBe(longLine!.indexOf("Long flag description"))
    }).pipe(Effect.provide(TestLayer)))

  it.effect("aligns flag descriptions when flag names contain wide graphemes", () =>
    Effect.gen(function*() {
      const command = Command.make("tool", {
        file: Flag.Boolean("ファイル").pipe(Flag.withDescription("Wide flag description")),
        emoji: Flag.Boolean("👩‍💻").pipe(Flag.withDescription("Emoji flag description")),
        verbose: Flag.Boolean("verbose").pipe(Flag.withDescription("ASCII flag description"))
      })
      const run = Command.runWith(command, { version: "1.0.0" })

      yield* run(["--help"])

      const lines = (yield* TestConsole.logLines).join("\n").split("\n")
      assert.include(lines, "  --ファイル    Wide flag description")
      assert.include(lines, "  --👩‍💻          Emoji flag description")
      assert.include(lines, "  --verbose     ASCII flag description")
    }).pipe(Effect.provide(TestLayer)))

  it.effect("aligns flag descriptions when flag names contain zero-width code points", () =>
    Effect.gen(function*() {
      const command = Command.make("tool", {
        combining: Flag.Boolean("e\u0301").pipe(Flag.withDescription("Combining flag description")),
        zeroWidth: Flag.Boolean("a\u200Bb").pipe(Flag.withDescription("Zero-width flag description")),
        ascii: Flag.Boolean("abcd").pipe(Flag.withDescription("ASCII flag description"))
      })
      const run = Command.runWith(command, { version: "1.0.0" })

      yield* run(["--help"])

      const lines = (yield* TestConsole.logLines).join("\n").split("\n")
      assert.include(lines, "  --e\u0301       Combining flag description")
      assert.include(lines, "  --a\u200Bb      Zero-width flag description")
      assert.include(lines, "  --abcd    ASCII flag description")
    }).pipe(Effect.provide(TestLayer)))

  it.effect("separates long subcommand and argument names from their descriptions", () =>
    Effect.gen(function*() {
      const child = Command.make("account:set-password", {
        account: Argument.String("existing-account-identifier").pipe(
          Argument.withDescription("Account to update")
        )
      }).pipe(Command.withDescription("Rewrite the credential hash"))
      const command = Command.make("demo").pipe(Command.withSubcommands([child]))
      const run = Command.runWith(command, { version: "1.0.0" })

      yield* run(["--help"])
      const rootHelp = yield* TestConsole.logLines

      yield* run(["account:set-password", "--help"])
      const allHelp = yield* TestConsole.logLines
      const childHelp = allHelp.slice(rootHelp.length)

      assert.isTrue(rootHelp.some((line) => String(line).includes("account:set-password Rewrite the credential hash")))
      assert.isTrue(
        childHelp.some((line) => String(line).includes("existing-account-identifier string Account to update"))
      )
    }).pipe(Effect.provide(TestLayer)))

  it.effect("hides flags marked with withHidden from help output", () =>
    Effect.gen(function*() {
      const command = Command.make("tool", {
        visible: Flag.String("visible").pipe(Flag.withDescription("Visible flag")),
        secret: Flag.String("experimental-foo").pipe(
          Flag.withDescription("Should not appear"),
          Flag.withHidden
        )
      })
      const run = Command.runWith(command, { version: "1.0.0" })

      yield* run(["--help"])

      const helpText = (yield* TestConsole.logLines).join("\n")
      expect(helpText).toContain("--visible")
      expect(helpText).not.toContain("--experimental-foo")
      expect(helpText).not.toContain("Should not appear")
    }).pipe(Effect.provide(TestLayer)))

  it.effect("hidden flag still parses on the command line", () =>
    Effect.gen(function*() {
      let captured: string | undefined
      const command = Command.make("tool", {
        secret: Flag.String("experimental-foo").pipe(Flag.withHidden)
      }, (config) =>
        Effect.sync(() => {
          captured = config.secret
        }))
      const run = Command.runWith(command, { version: "1.0.0" })

      yield* run(["--experimental-foo", "value"])

      expect(captured).toBe("value")
    }).pipe(Effect.provide(TestLayer)))

  it.effect("hidden flag name does not leak through unrecognized-flag suggestions", () =>
    Effect.gen(function*() {
      const command = Command.make("tool", {
        secret: Flag.String("experimental-foo").pipe(Flag.withHidden)
      }, () => Effect.void)
      const run = Command.runWith(command, { version: "1.0.0" })

      yield* run(["--experimental-fo", "value"]).pipe(
        Effect.catchTag("ShowHelp", () => Effect.void)
      )

      const errorText = (yield* TestConsole.errorLines).join("\n")
      const helpText = (yield* TestConsole.logLines).join("\n")
      expect(errorText + helpText).not.toContain("experimental-foo")
    }).pipe(Effect.provide(TestLayer)))

  it.effect("hides unlisted subcommands from help output", () =>
    Effect.gen(function*() {
      const visible = Command.make("visible").pipe(
        Command.withDescription("A visible subcommand")
      )
      const secret = Command.make("experimental-foo").pipe(
        Command.withDescription("Should not appear"),
        Command.unlisted
      )
      const root = Command.make("tool").pipe(
        Command.withSubcommands([visible, secret])
      )
      const run = Command.runWith(root, { version: "1.0.0" })

      yield* run(["--help"])

      const helpText = (yield* TestConsole.logLines).join("\n")
      expect(helpText).toContain("visible")
      expect(helpText).not.toContain("experimental-foo")
      expect(helpText).not.toContain("Should not appear")
    }).pipe(Effect.provide(TestLayer)))

  it.effect("unlisted subcommand still parses on the command line", () =>
    Effect.gen(function*() {
      let invoked = false
      const secret = Command.make("experimental-foo").pipe(
        Command.unlisted,
        Command.withHandler(() =>
          Effect.sync(() => {
            invoked = true
          })
        )
      )
      const root = Command.make("tool").pipe(
        Command.withSubcommands([secret])
      )
      const run = Command.runWith(root, { version: "1.0.0" })

      yield* run(["experimental-foo"])

      expect(invoked).toBe(true)
    }).pipe(Effect.provide(TestLayer)))

  it.effect("unlisted subcommand name does not leak through unknown-subcommand suggestions", () =>
    Effect.gen(function*() {
      const secret = Command.make("experimental-foo").pipe(Command.unlisted)
      const root = Command.make("tool").pipe(
        Command.withSubcommands([secret])
      )
      const run = Command.runWith(root, { version: "1.0.0" })

      yield* run(["experimental-fo"]).pipe(
        Effect.catchTag("ShowHelp", () => Effect.void)
      )

      const errorText = (yield* TestConsole.errorLines).join("\n")
      const helpText = (yield* TestConsole.logLines).join("\n")
      expect(errorText + helpText).not.toContain("experimental-foo")
    }).pipe(Effect.provide(TestLayer)))

  it.effect("subcommand group with only unlisted commands disappears entirely", () =>
    Effect.gen(function*() {
      const secret = Command.make("experimental-foo").pipe(Command.unlisted)
      const root = Command.make("tool").pipe(
        Command.withSubcommands([secret])
      )
      const run = Command.runWith(root, { version: "1.0.0" })

      yield* run(["--help"])

      const helpText = (yield* TestConsole.logLines).join("\n")
      expect(helpText).not.toContain("SUBCOMMANDS")
      expect(helpText).not.toContain("<subcommand>")
    }).pipe(Effect.provide(TestLayer)))

  it.effect("renders command examples", () =>
    Effect.gen(function*() {
      const command = Command.make("login").pipe(
        Command.withDescription("Authenticate with Supabase"),
        Command.withExamples([
          { command: "myapp login", description: "Log in with browser OAuth" },
          { command: "myapp login --token sbp_abc123", description: "Log in with a token" },
          { command: "myapp login --logout" },
          { command: "myapp login --logout" },
          { command: "myapp login", description: "Log in with browser OAuth" }
        ])
      )
      const runLogin = Command.runWith(command, { version: "1.0.0" })

      yield* runLogin(["--help"])

      const output = (yield* TestConsole.logLines).join("\n")
      expect(output).toMatchInlineSnapshot(`
        "DESCRIPTION
          Authenticate with Supabase

        USAGE
          login [flags]

        GLOBAL FLAGS
          --help, -h                                                          Show help information
          --version, -v                                                       Show version information
          --wizard                                                            Start wizard mode for a command
          --completions <bash|zsh|fish|sh>                                    Print shell completion script (choices: bash, zsh, fish, sh)
          --log-level <all|trace|debug|info|warn|warning|error|fatal|none>    Sets the minimum log level (choices: all, trace, debug, info, warn, warning, error, fatal, none)

        EXAMPLES
          # Log in with browser OAuth
          myapp login

          # Log in with a token
          myapp login --token sbp_abc123

          myapp login --logout
          myapp login --logout

          # Log in with browser OAuth
          myapp login"
      `)
    }).pipe(Effect.provide(TestLayer)))

  it.effect("renders file command positional arguments", () =>
    Effect.gen(function*() {
      const helpText = yield* runCommand(["copy", "--help"])

      expect(helpText).toMatchInlineSnapshot(`
        "DESCRIPTION
          Copy files or directories

        USAGE
          mycli copy [flags] <source> <destination>

        ARGUMENTS
          source file         Source file or directory
          destination file    Destination path

        FLAGS
          --debug, -d              Enable debug logging
          --config, -c file        Path to configuration file
          --quiet, -q              Suppress non-error output
          --recursive, -r          Copy directories recursively
          --force, -f              Overwrite existing files
          --buffer-size integer    Buffer size in KB

        GLOBAL FLAGS
          --help, -h                                                          Show help information
          --version, -v                                                       Show version information
          --wizard                                                            Start wizard mode for a command
          --completions <bash|zsh|fish|sh>                                    Print shell completion script (choices: bash, zsh, fish, sh)
          --log-level <all|trace|debug|info|warn|warning|error|fatal|none>    Sets the minimum log level (choices: all, trace, debug, info, warn, warning, error, fatal, none)"
      `)
    }).pipe(Effect.provide(TestLayer)))

  it.effect("renders variadic arguments", () =>
    Effect.gen(function*() {
      const helpText = yield* runCommand(["remove", "--help"])

      expect(helpText).toMatchInlineSnapshot(`
        "DESCRIPTION
          Remove files or directories

        USAGE
          mycli remove [flags] <files...>

        ARGUMENTS
          files... string    Files to remove

        FLAGS
          --debug, -d          Enable debug logging
          --config, -c file    Path to configuration file
          --quiet, -q          Suppress non-error output
          --recursive, -r      Remove directories and contents
          --force, -f          Force removal without prompts
          --verbose, -v        Explain what is being done

        GLOBAL FLAGS
          --help, -h                                                          Show help information
          --version, -v                                                       Show version information
          --wizard                                                            Start wizard mode for a command
          --completions <bash|zsh|fish|sh>                                    Print shell completion script (choices: bash, zsh, fish, sh)
          --log-level <all|trace|debug|info|warn|warning|error|fatal|none>    Sets the minimum log level (choices: all, trace, debug, info, warn, warning, error, fatal, none)"
      `)
    }).pipe(Effect.provide(TestLayer)))

  it.effect("renders deeply nested subcommand help", () =>
    Effect.gen(function*() {
      const helpText = yield* runCommand(["admin", "users", "list", "--help"])

      expect(helpText).toMatchInlineSnapshot(`
        "DESCRIPTION
          List all users in the system

        USAGE
          mycli admin users list [flags]

        FLAGS
          --debug, -d          Enable debug logging
          --config, -c file    Path to configuration file
          --quiet, -q          Suppress non-error output
          --sudo               Run with elevated privileges
          --format string      Output format (json, table, csv)
          --active             Show only active users
          --verbose, -v        Show detailed information

        GLOBAL FLAGS
          --help, -h                                                          Show help information
          --version, -v                                                       Show version information
          --wizard                                                            Start wizard mode for a command
          --completions <bash|zsh|fish|sh>                                    Print shell completion script (choices: bash, zsh, fish, sh)
          --log-level <all|trace|debug|info|warn|warning|error|fatal|none>    Sets the minimum log level (choices: all, trace, debug, info, warn, warning, error, fatal, none)"
      `)
    }).pipe(Effect.provide(TestLayer)))

  it.effect("renders mixed required and optional positional arguments", () =>
    Effect.gen(function*() {
      const helpText = yield* runCommand(["admin", "users", "create", "--help"])

      expect(helpText).toMatchInlineSnapshot(`
        "DESCRIPTION
          Create a new user account

        USAGE
          mycli admin users create [flags] <username> [<email>]

        ARGUMENTS
          username string    Username for the new user
          email string       Email address (optional) (optional)

        FLAGS
          --debug, -d          Enable debug logging
          --config, -c file    Path to configuration file
          --quiet, -q          Suppress non-error output
          --sudo               Run with elevated privileges
          --role string        User role (admin, user, guest)
          --notify, -n         Send notification email

        GLOBAL FLAGS
          --help, -h                                                          Show help information
          --version, -v                                                       Show version information
          --wizard                                                            Start wizard mode for a command
          --completions <bash|zsh|fish|sh>                                    Print shell completion script (choices: bash, zsh, fish, sh)
          --log-level <all|trace|debug|info|warn|warning|error|fatal|none>    Sets the minimum log level (choices: all, trace, debug, info, warn, warning, error, fatal, none)"
      `)
    }).pipe(Effect.provide(TestLayer)))

  it.effect("renders intermediate subcommand shared flags and children", () =>
    Effect.gen(function*() {
      const helpText = yield* runCommand(["admin", "config", "--help"])

      expect(helpText).toMatchInlineSnapshot(`
        "DESCRIPTION
          Manage application configuration

        USAGE
          mycli admin config <subcommand> [flags]

        FLAGS
          --debug, -d             Enable debug logging
          --config, -c file       Path to configuration file
          --quiet, -q             Suppress non-error output
          --sudo                  Run with elevated privileges
          --profile, -p string    Configuration profile to use

        GLOBAL FLAGS
          --help, -h                                                          Show help information
          --version, -v                                                       Show version information
          --wizard                                                            Start wizard mode for a command
          --completions <bash|zsh|fish|sh>                                    Print shell completion script (choices: bash, zsh, fish, sh)
          --log-level <all|trace|debug|info|warn|warning|error|fatal|none>    Sets the minimum log level (choices: all, trace, debug, info, warn, warning, error, fatal, none)

        SUBCOMMANDS
          set    Set configuration values
          get    Get configuration value"
      `)
    }).pipe(Effect.provide(TestLayer)))

  it.effect("renders variadic arguments with a minimum count", () =>
    Effect.gen(function*() {
      const helpText = yield* runCommand(["admin", "config", "set", "--help"])

      expect(helpText).toMatchInlineSnapshot(`
        "DESCRIPTION
          Set configuration values

        USAGE
          mycli admin config set [flags] <key=value...>

        ARGUMENTS
          key=value... string    Configuration key-value pairs

        FLAGS
          --debug, -d               Enable debug logging
          --config, -c file         Path to configuration file
          --quiet, -q               Suppress non-error output
          --sudo                    Run with elevated privileges
          --profile, -p string      Configuration profile to use
          --config-file, -f file    Write to specific config file

        GLOBAL FLAGS
          --help, -h                                                          Show help information
          --version, -v                                                       Show version information
          --wizard                                                            Start wizard mode for a command
          --completions <bash|zsh|fish|sh>                                    Print shell completion script (choices: bash, zsh, fish, sh)
          --log-level <all|trace|debug|info|warn|warning|error|fatal|none>    Sets the minimum log level (choices: all, trace, debug, info, warn, warning, error, fatal, none)"
      `)
    }).pipe(Effect.provide(TestLayer)))

  it.effect("shared flags are visible in subcommand help while local flags stay local", () =>
    Effect.gen(function*() {
      const root = Command.make("tool", {
        workspace: Flag.String("workspace")
      }).pipe(
        Command.withSharedFlags({
          model: Flag.String("model")
        }),
        Command.withSubcommands([
          Command.make("chat", {
            topic: Flag.String("topic")
          })
        ])
      )

      const runRoot = Command.runWith(root, { version: "1.0.0" })

      yield* runRoot(["--help"])
      const rootHelp = yield* TestConsole.logLines
      expect(rootHelp.some((line) => String(line).includes("--workspace"))).toBe(true)
      expect(rootHelp.some((line) => String(line).includes("--model"))).toBe(true)

      yield* runRoot(["chat", "--help"])
      const allHelp = yield* TestConsole.logLines
      const chatHelp = allHelp.slice(rootHelp.length)
      expect(chatHelp.some((line) => String(line).includes("--workspace"))).toBe(false)
      expect(chatHelp.some((line) => String(line).includes("--model"))).toBe(true)
      expect(chatHelp.some((line) => String(line).includes("--topic"))).toBe(true)
    }).pipe(Effect.provide(TestLayer)))

  it.effect("includes inherited shared flags in subcommand completions", () =>
    Effect.gen(function*() {
      const root = Command.make("tool").pipe(
        Command.withSharedFlags({
          workspace: Flag.String("workspace").pipe(Flag.withAlias("w"))
        }),
        Command.withSubcommands([
          Command.make("chat", {
            topic: Flag.String("topic").pipe(Flag.withAlias("t"))
          })
        ])
      )
      const runRoot = Command.runWith(root, { version: "1.0.0" })

      yield* runRoot(["--completions", "bash"])

      const completionScript = (yield* TestConsole.logLines).join("\n")
      const chatCompletions = completionScript.slice(completionScript.indexOf("_tool_chat()"))
      expect(chatCompletions).toContain(`_filtered_flags+=" --topic -t"`)
      expect(chatCompletions).toContain(`_filtered_flags+=" --workspace -w"`)
    }).pipe(Effect.provide(TestLayer)))

  it.effect("renders grouped subcommands", () =>
    Effect.gen(function*() {
      const ungrouped = Command.make("ungrouped").pipe(
        Command.withDescription("This command is not in a group")
      )
      const init = Command.make("init").pipe(Command.withDescription("Create a new project"))
      const login = Command.make("login").pipe(Command.withDescription("Authenticate with the platform"))
      const start = Command.make("start").pipe(Command.withDescription("Start local services"))
      const stop = Command.make("stop").pipe(Command.withDescription("Stop local services"))
      const db = Command.make("db").pipe(Command.withDescription("Manage local database"))
      const projects = Command.make("projects").pipe(Command.withDescription("Manage cloud projects"))
      const functions = Command.make("functions").pipe(Command.withDescription("Manage edge functions"))

      const grouped = Command.make("tool").pipe(
        Command.withSubcommands([
          {
            group: "Quick Start",
            commands: [init, login]
          },
          {
            group: "Local Development",
            commands: [start, stop, db]
          },
          {
            group: "Management APIs",
            commands: [projects, functions]
          },
          ungrouped
        ])
      )

      const runGrouped = Command.runWith(grouped, { version: "1.0.0" })
      yield* runGrouped(["--help"])

      const helpText = (yield* TestConsole.logLines).join("\n")

      expect(helpText).toMatchInlineSnapshot(`
        "USAGE
          tool <subcommand> [flags]

        GLOBAL FLAGS
          --help, -h                                                          Show help information
          --version, -v                                                       Show version information
          --wizard                                                            Start wizard mode for a command
          --completions <bash|zsh|fish|sh>                                    Print shell completion script (choices: bash, zsh, fish, sh)
          --log-level <all|trace|debug|info|warn|warning|error|fatal|none>    Sets the minimum log level (choices: all, trace, debug, info, warn, warning, error, fatal, none)

        SUBCOMMANDS
          ungrouped    This command is not in a group

        Quick Start:
          init     Create a new project
          login    Authenticate with the platform

        Local Development:
          start    Start local services
          stop     Stop local services
          db       Manage local database

        Management APIs:
          projects     Manage cloud projects
          functions    Manage edge functions"
      `)
    }).pipe(Effect.provide(TestLayer)))

  it.effect("renders subcommand aliases in listings", () =>
    Effect.gen(function*() {
      const plan = Command.make("plan").pipe(
        Command.withAlias("p"),
        Command.withDescription("Draft a plan in your editor")
      )

      const root = Command.make("tool").pipe(Command.withSubcommands([plan]))
      const runRoot = Command.runWith(root, { version: "1.0.0" })

      yield* runRoot(["--help"])

      const helpText = (yield* TestConsole.logLines).join("\n")

      expect(helpText).toMatchInlineSnapshot(`
        "USAGE
          tool <subcommand> [flags]

        GLOBAL FLAGS
          --help, -h                                                          Show help information
          --version, -v                                                       Show version information
          --wizard                                                            Start wizard mode for a command
          --completions <bash|zsh|fish|sh>                                    Print shell completion script (choices: bash, zsh, fish, sh)
          --log-level <all|trace|debug|info|warn|warning|error|fatal|none>    Sets the minimum log level (choices: all, trace, debug, info, warn, warning, error, fatal, none)

        SUBCOMMANDS
          plan, p    Draft a plan in your editor"
      `)
    }).pipe(Effect.provide(TestLayer)))

  it.effect("keeps subcommand flags in aliased completion contexts", () =>
    Effect.gen(function*() {
      const list = Command.make("list", {
        format: Flag.Literals("format", ["json", "text"])
      }).pipe(Command.withAlias("ls"))
      const root = Command.make("ctl").pipe(Command.withSubcommands([list]))
      const runRoot = Command.runWith(root, { version: "1.0.0" })

      yield* runRoot(["--completions", "bash"])

      const completion = (yield* TestConsole.logLines).join("\n")
      const aliasContext = completion.split("_ctl_ls()")[1]?.split("\n}")[0] ?? ""
      expect(aliasContext).toContain("--format")
    }).pipe(Effect.provide(TestLayer)))
})
