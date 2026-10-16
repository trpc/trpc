/**
 * CLI entry point for ai-codegen tool.
 *
 * @since 4.0.0
 */
import * as Command from "effect/cli/Command"
import * as Flag from "effect/cli/Flag"
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as ProviderDiscovery from "./Discovery.ts"
import * as CodeGenerator from "./Generator.ts"
import * as Glob from "./Glob.ts"
import * as PostProcessor from "./PostProcess.ts"
import * as SpecFetcher from "./SpecFetcher.ts"

// =============================================================================
// Flags
// =============================================================================

const providerFlag = Flag.String("provider").pipe(
  Flag.withAlias("p"),
  Flag.withDescription("Generate for specific provider only"),
  Flag.optional
)

const skipLintFlag = Flag.Boolean("skip-lint").pipe(
  Flag.withDescription("Skip Oxlint step"),
  Flag.withDefault(false)
)

const skipFormatFlag = Flag.Boolean("skip-format").pipe(
  Flag.withDescription("Skip Dprint step"),
  Flag.withDefault(false)
)

// =============================================================================
// ANSI Colors
// =============================================================================

const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  gray: "\x1b[90m",
  white: "\x1b[37m"
} as const

// =============================================================================
// Generate Command
// =============================================================================

interface GenerateOptions {
  readonly skipLint: boolean
  readonly skipFormat: boolean
}

const formatSpecSource = (source: ProviderDiscovery.DiscoveredProvider["specSource"]): string => {
  switch (source._tag) {
    case "Url":
      return source.url
    case "File":
      return source.path
    case "StainlessStats":
      return `stainless-stats(${source.statsUrl})`
  }
}

const generateProvider = Effect.fn("generateProvider")(function*(
  provider: ProviderDiscovery.DiscoveredProvider,
  options: GenerateOptions
) {
  const specFetcher = yield* SpecFetcher.SpecFetcher
  const generator = yield* CodeGenerator.CodeGenerator
  const postProcessor = yield* PostProcessor.PostProcessor
  const fs = yield* FileSystem.FileSystem

  yield* Console.log(`\n${colors.bold}${colors.cyan}${provider.name}${colors.reset}`)

  // Fetch spec
  yield* Console.log(`  ${colors.dim}Fetching spec...${colors.reset}`)
  const spec = yield* specFetcher.fetch(provider.specSource, provider.name)

  // Generate code
  yield* Console.log(`  ${colors.dim}Generating code...${colors.reset}`)
  let code = yield* generator.generate(provider, spec)

  // Apply replacements
  const replacements = provider.config.replacementList
  if (replacements.length > 0) {
    yield* Console.log(`  ${colors.dim}Applying ${replacements.length} replacement(s)...${colors.reset}`)
    for (const replacement of replacements) {
      code = code.replaceAll(replacement.from, replacement.to)
    }
  }

  // Prepend header if configured
  const header = provider.config.headerContent
  if (header !== undefined) {
    code = `${header}\n${code}`
  }

  // Write output
  yield* Console.log(`  ${colors.dim}Writing output...${colors.reset}`)
  yield* fs.writeFileString(provider.outputPath, code)

  // Post-process
  if (!options.skipLint) {
    yield* Console.log(`  ${colors.dim}Linting...${colors.reset}`)
    yield* postProcessor.lint(provider.outputPath)
  }

  if (!options.skipFormat) {
    yield* Console.log(`  ${colors.dim}Formatting...${colors.reset}`)
    yield* postProcessor.format(provider.outputPath)
  }

  yield* Console.log(
    `  ${colors.green}✓${colors.reset} ${colors.gray}${provider.config.output}${colors.reset}`
  )
  return provider.outputPath
})

const generate = Command.make("generate", {
  provider: providerFlag,
  skipLint: skipLintFlag,
  skipFormat: skipFormatFlag
}).pipe(
  Command.withHandler(Effect.fnUntraced(function*({ provider, skipLint, skipFormat }) {
    const discovery = yield* ProviderDiscovery.ProviderDiscovery

    const providers = yield* Option.match(provider, {
      onNone: () => discovery.discover(),
      onSome: (name) => discovery.discoverOne(name).pipe(Effect.map((p) => [p]))
    })

    if (providers.length === 0) {
      yield* Console.log(`${colors.yellow}No providers found.${colors.reset}`)
      return
    }

    yield* Console.log(
      `${colors.dim}Generating ${providers.length} provider(s)...${colors.reset}`
    )

    for (const p of providers) {
      yield* generateProvider(p, { skipLint, skipFormat })
    }

    yield* Console.log(`\n${colors.green}✓ All providers generated successfully!${colors.reset}`)
  }))
)

// =============================================================================
// List Command
// =============================================================================

const list = Command.make("list").pipe(
  Command.withHandler(Effect.fnUntraced(function*() {
    const discovery = yield* ProviderDiscovery.ProviderDiscovery
    const providers = yield* discovery.discover()

    if (providers.length === 0) {
      yield* Console.log(`${colors.yellow}No providers found.${colors.reset}`)
      return
    }

    yield* Console.log(`${colors.green}Found ${providers.length} provider(s):${colors.reset}\n`)

    for (const p of providers) {
      yield* Console.log(`${colors.bold}${colors.cyan}${p.name}${colors.reset}`)
      yield* Console.log(`  ${colors.gray}spec:${colors.reset}     ${formatSpecSource(p.specSource)}`)
      yield* Console.log(`  ${colors.gray}output:${colors.reset}   ${p.config.output}`)
      yield* Console.log(
        `  ${colors.gray}client:${colors.reset}   ${colors.white}${p.config.clientName}${colors.reset}`
      )
      yield* Console.log(`  ${colors.gray}typeOnly:${colors.reset} ${p.config.isTypeOnly}`)
      if (p.config.patchList.length > 0) {
        yield* Console.log(
          `  ${colors.gray}patches:${colors.reset}  ${colors.yellow}${p.config.patchList.length} file(s)${colors.reset}`
        )
      }
      yield* Console.log("")
    }
  }))
)

// =============================================================================
// Root Command
// =============================================================================

const root = Command.make("effect-ai-codegen").pipe(
  Command.withSubcommands([generate, list])
)

// =============================================================================
// Layer Composition
// =============================================================================

// ProviderDiscovery depends on Glob, FileSystem, and Path
// SpecFetcher depends on FileSystem and HttpClient
// CodeGenerator depends on OpenApiGenerator
// PostProcessor depends on ChildProcessSpawner

// Build up layers with dependencies
const DiscoveryLayer = ProviderDiscovery.layer.pipe(
  Layer.provide(Glob.layer)
)

const SpecFetcherLayer = SpecFetcher.layer.pipe(
  Layer.provide(FetchHttpClient.layer)
)

const ServicesLayer = Layer.mergeAll(
  DiscoveryLayer,
  SpecFetcherLayer,
  CodeGenerator.layerSchema,
  PostProcessor.layer
)

// =============================================================================
// Export
// =============================================================================

/**
 * Run the CLI.
 *
 * @category running
 * @since 4.0.0
 */
export const run = Command.run(root, { version: "0.0.0" }).pipe(
  Effect.provide(ServicesLayer)
)
