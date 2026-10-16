import { Effect, Option } from "effect"
import { Argument, Command, Flag } from "effect/cli"
import type { TestActions } from "../services/TestActions.ts"
import { logAction } from "../services/TestActions.ts"

// Deeply nested admin commands
const usersList = Command.make("list", {
  // Optional option with default
  format: Flag.String("format").pipe(
    Flag.withDescription("Output format (json, table, csv)"),
    Flag.withDefault("table")
  ),
  // Boolean flag
  active: Flag.Boolean("active").pipe(
    Flag.withDescription("Show only active users"),
    Flag.withDefault(false)
  ),
  // Option with both short and long aliases
  verbose: Flag.Boolean("verbose").pipe(
    Flag.withAlias("v"),
    Flag.withDescription("Show detailed information"),
    Flag.withDefault(false)
  )
}, (config) =>
  logAction("users list", {
    format: config.format,
    active: config.active,
    verbose: config.verbose
  })).pipe(
    Command.withDescription("List all users in the system")
  )

const usersCreate = Command.make("create", {
  // Required positional argument
  username: Argument.String("username").pipe(
    Argument.withDescription("Username for the new user")
  ),
  // Optional positional argument
  email: Argument.String("email").pipe(
    Argument.withDescription("Email address (optional)"),
    Argument.optional
  ),
  // Required option
  role: Flag.String("role").pipe(
    Flag.withDescription("User role (admin, user, guest)")
  ),
  // Boolean with explicit value support
  notify: Flag.Boolean("notify").pipe(
    Flag.withAlias("n"),
    Flag.withDescription("Send notification email"),
    Flag.withDefault(false)
  )
}, (config) =>
  logAction("users create", {
    username: config.username,
    email: config.email,
    role: config.role,
    notify: config.notify
  })).pipe(
    Command.withDescription("Create a new user account")
  )

const users = Command.make("users").pipe(
  Command.withDescription("User management commands"),
  Command.withSubcommands([usersList, usersCreate])
)

const configSet = Command.make("set", {
  // Variadic positional arguments
  pairs: Argument.String("key=value").pipe(
    Argument.withDescription("Configuration key-value pairs"),
    Argument.variadic({ min: 1 })
  ),
  // File path option
  file: Flag.File("config-file").pipe(
    Flag.withAlias("f"),
    Flag.withDescription("Write to specific config file"),
    Flag.optional
  )
}, (config) =>
  logAction("config set", {
    pairs: config.pairs,
    file: config.file
  })).pipe(
    Command.withDescription("Set configuration values")
  )

const configGet = Command.make("get", {
  // Single required positional
  key: Argument.String("key").pipe(
    Argument.withDescription("Configuration key to retrieve")
  ),
  // Options with different types
  source: Flag.String("source").pipe(
    Flag.withDescription("Configuration source (local, global, system)"),
    Flag.withDefault("local")
  )
}, (config) =>
  logAction("config get", {
    key: config.key,
    source: config.source
  })).pipe(
    Command.withDescription("Get configuration value")
  )

const config = Command.make("config").pipe(
  Command.withSharedFlags({
    // Parent command options shared with config subcommands
    profile: Flag.String("profile").pipe(
      Flag.withAlias("p"),
      Flag.withDescription("Configuration profile to use"),
      Flag.optional
    )
  }),
  Command.withDescription("Manage application configuration"),
  Command.withSubcommands([configSet, configGet])
)

const admin = Command.make("admin").pipe(
  Command.withSharedFlags({
    // Boolean that can be set to false explicitly
    sudo: Flag.Boolean("sudo").pipe(
      Flag.withDescription("Run with elevated privileges"),
      Flag.withDefault(false)
    )
  }),
  Command.withDescription("Administrative commands"),
  Command.withSubcommands([users, config])
)

// File operations commands
const copy = Command.make("copy", {
  // Multiple required positional arguments (do not require actual filesystem presence in tests)
  source: Argument.File("source", { mustExist: false }).pipe(
    Argument.withDescription("Source file or directory")
  ),
  destination: Argument.File("destination", { mustExist: false }).pipe(
    Argument.withDescription("Destination path")
  ),
  // Boolean flags with short aliases
  recursive: Flag.Boolean("recursive").pipe(
    Flag.withAlias("r"),
    Flag.withDescription("Copy directories recursively"),
    Flag.withDefault(false)
  ),
  force: Flag.Boolean("force").pipe(
    Flag.withAlias("f"),
    Flag.withDescription("Overwrite existing files"),
    Flag.withDefault(false)
  ),
  // Integer option
  buffer: Flag.Int("buffer-size").pipe(
    Flag.withDescription("Buffer size in KB"),
    Flag.withDefault(64)
  )
}, (config) =>
  logAction("copy", {
    source: config.source,
    destination: config.destination,
    recursive: config.recursive,
    force: config.force,
    bufferSize: config.buffer
  })).pipe(
    Command.withDescription("Copy files or directories")
  )

const move = Command.make("move", {
  // Variadic sources with at least 2 items
  paths: Argument.String("paths").pipe(
    Argument.withDescription("Source path(s) and destination"),
    Argument.variadic({ min: 2 })
  ),
  // Options
  interactive: Flag.Boolean("interactive").pipe(
    Flag.withAlias("i"),
    Flag.withDescription("Prompt before overwrite"),
    Flag.withDefault(false)
  )
}, (config) =>
  logAction("move", {
    paths: config.paths,
    interactive: config.interactive
  })).pipe(
    Command.withDescription("Move or rename files")
  )

const remove = Command.make("remove", {
  // Variadic with no upper limit
  files: Argument.String("files").pipe(
    Argument.withDescription("Files to remove"),
    Argument.variadic({ min: 1 })
  ),
  // Multiple boolean options
  recursive: Flag.Boolean("recursive").pipe(
    Flag.withAlias("r"),
    Flag.withDescription("Remove directories and contents"),
    Flag.withDefault(false)
  ),
  force: Flag.Boolean("force").pipe(
    Flag.withAlias("f"),
    Flag.withDescription("Force removal without prompts"),
    Flag.withDefault(false)
  ),
  verbose: Flag.Boolean("verbose").pipe(
    Flag.withAlias("v"),
    Flag.withDescription("Explain what is being done"),
    Flag.withDefault(false)
  )
}, (config) =>
  logAction("remove", {
    files: config.files,
    recursive: config.recursive,
    force: config.force,
    verbose: config.verbose
  })).pipe(
    Command.withDescription("Remove files or directories")
  )

// Build command for testing option aliases
const build = Command.make("build", {
  output: Flag.String("output").pipe(
    Flag.withAlias("o"),
    Flag.withDescription("Output directory")
  ),
  verbose: Flag.Boolean("verbose").pipe(
    Flag.withAlias("v"),
    Flag.withDescription("Enable verbose output"),
    Flag.withDefault(false)
  ),
  configFile: Flag.String("config-file").pipe(
    Flag.withAlias("f"),
    Flag.withDescription("Configuration file path"),
    Flag.optional
  )
}, (config) =>
  logAction("build", {
    output: config.output,
    verbose: config.verbose,
    config: Option.getOrElse(config.configFile, () => "none")
  })).pipe(
    Command.withDescription("Build the project")
  )

// Git-style commands for testing subcommands and context sharing
const gitClone = Command.make("clone", {
  repository: Argument.String("repository").pipe(
    Argument.withDescription("Repository URL or path")
  ),
  branch: Flag.String("branch").pipe(
    Flag.withDefault("main"),
    Flag.withDescription("Branch to clone")
  )
}, (config) =>
  logAction("git clone", {
    repository: config.repository,
    branch: config.branch
  })).pipe(
    Command.withDescription("Clone a repository")
  )

const gitAdd = Command.make("add", {
  files: Argument.String("files").pipe(
    Argument.withDescription("Files to add")
  ),
  update: Flag.Boolean("update").pipe(
    Flag.withDescription("Update tracked files"),
    Flag.withDefault(false)
  )
}, (config) =>
  logAction("git add", {
    files: config.files,
    update: config.update
  })).pipe(
    Command.withDescription("Add files to staging")
  )

const gitStatus = Command.make("status", {
  short: Flag.Boolean("short").pipe(
    Flag.withDescription("Show short format"),
    Flag.withDefault(false)
  )
}, (config) =>
  logAction("git status", {
    short: config.short
  })).pipe(
    Command.withDescription("Show repository status")
  )

const git = Command.make("git").pipe(
  Command.withSharedFlags({
    verbose: Flag.Boolean("verbose").pipe(
      Flag.withDescription("Enable verbose output"),
      Flag.withDefault(false)
    )
  }),
  Command.withHandler((config) =>
    logAction("git", {
      verbose: config.verbose
    })
  ),
  Command.withDescription("Git version control"),
  Command.withSubcommands([gitClone, gitAdd, gitStatus])
)

// Commands for testing error handling
const testRequired = Command.make("test-required", {
  required: Flag.String("required").pipe(
    Flag.withDescription("A required option for testing")
  )
}, (config) =>
  logAction("test-required", {
    required: config.required
  })).pipe(
    Command.withDescription("Test command with required option")
  )

const testFailing: Command.Command<
  "test-failing",
  { readonly input: string },
  {},
  string,
  TestActions
> = Command.make("test-failing", {
  input: Flag.String("input").pipe(
    Flag.withDescription("Input that will cause handler to fail")
  )
}, (config) =>
  Effect.gen(function*() {
    yield* logAction("test-failing", { input: config.input })
    return yield* Effect.fail("Handler error")
  })).pipe(
    Command.withDescription("Test command that always fails")
  )

// Deploy command for testing complex nested structures
const deployCommand = Command.make("deploy", {
  service: Argument.String("service").pipe(
    Argument.withDescription("Service to deploy")
  ),
  environment: Argument.String("environment").pipe(
    Argument.withDescription("Target environment")
  ),
  database: {
    host: Flag.String("db-host").pipe(
      Flag.withDescription("Database host")
    ),
    port: Flag.Int("db-port").pipe(
      Flag.withDescription("Database port")
    )
  },
  dryRun: Flag.Boolean("dry-run").pipe(
    Flag.withDescription("Perform a dry run"),
    Flag.withDefault(false)
  )
}, (config) =>
  logAction("deploy", {
    service: config.service,
    environment: config.environment,
    database: config.database,
    dryRun: config.dryRun
  })).pipe(
    Command.withDescription("Deploy a service")
  )

const app = Command.make("app").pipe(
  Command.withSharedFlags({
    env: Flag.String("env").pipe(
      Flag.withDescription("Environment setting"),
      Flag.optional
    )
  }),
  Command.withHandler((config) =>
    logAction("app", {
      env: config.env
    })
  ),
  Command.withDescription("Application management"),
  Command.withSubcommands([deployCommand])
)

// Service command for nested context sharing tests
const serviceCommand = Command.make("service").pipe(
  Command.withSharedFlags({
    name: Flag.String("name").pipe(
      Flag.withDescription("Service name")
    )
  }),
  Command.withHandler((config) =>
    logAction("service", {
      name: config.name
    })
  ),
  Command.withDescription("Service management"),
  Command.withSubcommands([deployCommand])
)

const appWithService = Command.make("app-nested").pipe(
  Command.withSharedFlags({
    env: Flag.String("env").pipe(
      Flag.withDescription("Environment setting")
    )
  }),
  Command.withHandler((config) =>
    logAction("app-nested", {
      env: config.env
    })
  ),
  Command.withDescription("Application with nested services"),
  Command.withSubcommands([serviceCommand])
)

// Main command with global options
// Note: No handler on root command - running with no args should show help
export const ComprehensiveCli = Command.make("mycli").pipe(
  Command.withSharedFlags({
    // Global options available to all subcommands
    debug: Flag.Boolean("debug").pipe(
      Flag.withAlias("d"),
      Flag.withDescription("Enable debug logging"),
      Flag.withDefault(false)
    ),
    config: Flag.File("config").pipe(
      Flag.withAlias("c"),
      Flag.withDescription("Path to configuration file"),
      Flag.optional
    ),
    quiet: Flag.Boolean("quiet").pipe(
      Flag.withAlias("q"),
      Flag.withDescription("Suppress non-error output"),
      Flag.withDefault(false)
    )
  }),
  Command.withDescription("A comprehensive CLI tool demonstrating all features"),
  Command.withSubcommands([admin, copy, move, remove, build, git, testRequired, testFailing, app, appWithService])
)

export const run = Command.runWith(ComprehensiveCli, {
  version: "1.0.0"
})
