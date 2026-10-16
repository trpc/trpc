import { execFileSync, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { arch, cpus, platform, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { build } from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '../../../..')
const dependencyNodePaths = [resolve(repo, 'packages/router-core/node_modules')]
const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [name, value = 'true'] = arg.replace(/^--/, '').split('=', 2)
    return [name, value]
  }),
)
const knownArgs = new Set([
  'suite',
  'origin',
  'candidate',
  'runs',
  'output',
  'keep-artifacts',
  'cpu-prof',
  'profile-dir',
  'scenario',
  'mode',
  'implementation',
  'warmups',
  'iterations',
  'batch-requests',
])
for (const name of Object.keys(args)) {
  if (!knownArgs.has(name)) {
    throw new Error(`Unknown benchmark option: --${name}`)
  }
}
const suite = args.suite ?? 'primary'
const suites = new Set([
  'common',
  'safe-points',
  'coalesced-close',
  'small-memory',
  'smoke',
  'source',
  'strings',
  'owner',
  'owner-warm',
  'owner-soak',
  'primary',
])
if (!suites.has(suite)) {
  throw new Error(`Unknown benchmark suite: ${suite}`)
}
const isWarmSuite =
  suite === 'common' ||
  suite === 'safe-points' ||
  suite === 'coalesced-close' ||
  suite === 'strings' ||
  suite === 'owner-warm'
const selectedImplementations = isWarmSuite
  ? []
  : ['origin', 'worktree'].filter((implementation) => {
      if (!args.implementation || args.implementation === 'all') {
        return true
      }
      return args.implementation.split(',').includes(implementation)
    })
const unsupportedSuiteOption = (
  isWarmSuite
    ? ['runs', 'implementation']
    : ['warmups', 'iterations', 'batch-requests']
).find((name) => args[name] !== undefined)
if (unsupportedSuiteOption) {
  throw new Error(
    `--${unsupportedSuiteOption} is not supported by the ${suite} suite`,
  )
}
if (
  args['cpu-prof'] !== undefined &&
  !['true', 'false'].includes(args['cpu-prof'])
) {
  throw new Error('--cpu-prof must be true or false')
}
const cpuProfiled = args['cpu-prof'] === 'true'
if (args['profile-dir'] !== undefined && !cpuProfiled) {
  throw new Error('--profile-dir requires --cpu-prof=true')
}
const originRef = args.origin ?? 'origin/main'
const candidateRef = args.candidate ?? 'HEAD'
const originSha = execFileSync('git', ['rev-parse', `${originRef}^{commit}`], {
  cwd: repo,
  encoding: 'utf8',
}).trim()
const candidateSha =
  candidateRef === 'worktree'
    ? undefined
    : execFileSync('git', ['rev-parse', `${candidateRef}^{commit}`], {
        cwd: repo,
        encoding: 'utf8',
      }).trim()
const headSha = execFileSync('git', ['rev-parse', 'HEAD^{commit}'], {
  cwd: repo,
  encoding: 'utf8',
}).trim()
const runs = Number(args.runs ?? (suite === 'smoke' ? 1 : 3))
const outputPath = resolve(
  repo,
  args.output ??
    `packages/router-core/benchmarks/ssr-streaming/results/${suite}.json`,
)
if (!outputPath.endsWith('.json')) {
  throw new Error('Benchmark output must end in .json')
}
if (!Number.isInteger(runs) || runs < 1) {
  throw new Error('--runs must be an integer greater than zero')
}
const keepArtifacts = args['keep-artifacts']
  ? resolve(repo, args['keep-artifacts'])
  : undefined
if (
  keepArtifacts &&
  existsSync(keepArtifacts) &&
  readdirSync(keepArtifacts).length
) {
  throw new Error('--keep-artifacts must name a new or empty directory')
}
const temp = keepArtifacts ?? mkdtempSync(join(tmpdir(), 'tsr-ssr-streaming-'))
mkdirSync(temp, { recursive: true })
function cleanupTemporaryArtifacts() {
  if (!keepArtifacts) {
    rmSync(temp, { recursive: true, force: true })
  }
}
// Some setup and child-failure paths exit before the main try/finally can
// unwind. Register cleanup as soon as the temporary directory exists.
process.once('exit', cleanupTemporaryArtifacts)
const profileDir = cpuProfiled
  ? resolve(
      repo,
      args['profile-dir'] ?? outputPath.replace(/\.json$/, '-profiles'),
    )
  : undefined
if (profileDir) {
  if (existsSync(profileDir) && readdirSync(profileDir).length) {
    throw new Error(
      `${args['profile-dir'] === undefined ? 'Default profile directory' : '--profile-dir'} must name a new or empty directory`,
    )
  }
  mkdirSync(profileDir, { recursive: true })
}
const childEnvironment = { ...process.env, NODE_ENV: 'production' }

function sourcePathsAt(ref) {
  const output = execFileSync(
    'git',
    ['ls-tree', '-r', '--name-only', ref, '--', 'packages/router-core/src'],
    { cwd: repo, encoding: 'utf8' },
  ).trim()
  return output ? output.split('\n') : []
}

function worktreeSourcePaths() {
  const output = execFileSync(
    'git',
    [
      'ls-files',
      '--cached',
      '--others',
      '--exclude-standard',
      '--',
      'packages/router-core/src',
    ],
    { cwd: repo, encoding: 'utf8' },
  ).trim()
  return output
    ? output
        .split('\n')
        .filter((repositoryPath) => existsSync(resolve(repo, repositoryPath)))
        .sort()
    : []
}

function materializeSourceSnapshot(ref, sourceRoot, repositoryPaths) {
  for (const repositoryPath of repositoryPaths) {
    const target = join(
      sourceRoot,
      repositoryPath.slice('packages/router-core/src/'.length),
    )
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(
      target,
      execFileSync('git', ['show', `${ref}:${repositoryPath}`], { cwd: repo }),
    )
  }
}

function materializeWorktreeSnapshot(sourceRoot, repositoryPaths) {
  for (const repositoryPath of repositoryPaths) {
    const target = join(
      sourceRoot,
      repositoryPath.slice('packages/router-core/src/'.length),
    )
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, readFileSync(resolve(repo, repositoryPath)))
  }
}

function sourceSnapshotSha256(sourceRoot, repositoryPaths) {
  const hash = createHash('sha256')
  for (const repositoryPath of repositoryPaths) {
    hash.update(repositoryPath)
    hash.update('\0')
    hash.update(
      readFileSync(
        join(
          sourceRoot,
          repositoryPath.slice('packages/router-core/src/'.length),
        ),
      ),
    )
    hash.update('\0')
  }
  return hash.digest('hex')
}

const originSourceRoot = join(temp, 'origin/packages/router-core/src')
const candidateSourceRoot = join(temp, 'worktree/packages/router-core/src')
const originSourcePaths = sourcePathsAt(originSha)
const candidateSourcePaths =
  candidateRef === 'worktree'
    ? worktreeSourcePaths()
    : sourcePathsAt(candidateSha)
if (suite.startsWith('owner')) {
  const ownerSourcePath = 'packages/router-core/src/ssr/hydrationScripts.ts'
  const missingImplementations = []
  const requiredImplementations = isWarmSuite
    ? ['origin', 'worktree']
    : selectedImplementations
  if (
    requiredImplementations.includes('origin') &&
    !originSourcePaths.includes(ownerSourcePath)
  ) {
    missingImplementations.push(`origin (${originRef})`)
  }
  if (
    requiredImplementations.includes('worktree') &&
    !candidateSourcePaths.includes(ownerSourcePath)
  ) {
    missingImplementations.push(`candidate (${candidateRef})`)
  }
  if (missingImplementations.length > 0) {
    throw new Error(
      `The ${suite} suite requires hydrationScripts.ts in the selected revision(s). ` +
        `Missing from ${missingImplementations.join(' and ')}.`,
    )
  }
}
materializeSourceSnapshot(originSha, originSourceRoot, originSourcePaths)
if (candidateRef === 'worktree') {
  materializeWorktreeSnapshot(candidateSourceRoot, candidateSourcePaths)
} else {
  materializeSourceSnapshot(
    candidateSha,
    candidateSourceRoot,
    candidateSourcePaths,
  )
}
const originSourceSha256 = sourceSnapshotSha256(
  originSourceRoot,
  originSourcePaths,
)
const candidateSourceSha256 = sourceSnapshotSha256(
  candidateSourceRoot,
  candidateSourcePaths,
)
const measuredSourcePairSha256 = createHash('sha256')
  .update(originSourceSha256)
  .update('\0')
  .update(candidateSourceSha256)
  .digest('hex')
const transformSources = {
  origin: readFileSync(
    join(originSourceRoot, 'ssr/transformStreamWithRouter.ts'),
    'utf8',
  ),
  worktree: readFileSync(
    join(candidateSourceRoot, 'ssr/transformStreamWithRouter.ts'),
    'utf8',
  ),
}
const hasHistoricalBufferGuards = {
  origin: transformSources.origin.includes(
    'SSR router HTML exceeded maximum buffer',
  ),
  worktree: transformSources.worktree.includes(
    'SSR router HTML exceeded maximum buffer',
  ),
}
const transformExportNames = {
  origin: transformSources.origin.includes(
    'export function transformStreamWithRouter(',
  )
    ? 'transformStreamWithRouter'
    : 'transformReadableStreamWithRouter',
  worktree: transformSources.worktree.includes(
    'export function transformStreamWithRouter(',
  )
    ? 'transformStreamWithRouter'
    : 'transformReadableStreamWithRouter',
}

// The worktree transform imports protocol constants from hydrationScripts.
// Its producer is not used by this benchmark worker, so the Vite-only script
// string can stay empty in the benchmark bundle.
const scriptStringPlugin = {
  name: 'script-string',
  setup(build) {
    build.onResolve({ filter: /\?script-string$/ }, (args) => ({
      path: args.path,
      namespace: 'script-string',
    }))
    build.onLoad({ filter: /.*/, namespace: 'script-string' }, () => ({
      contents: 'export default ""',
      loader: 'js',
    }))
  },
}

async function bundle(implementation) {
  const sourceRoot =
    implementation === 'origin' ? originSourceRoot : candidateSourceRoot
  const entry = join(temp, `${implementation}-entry.ts`)
  writeFileSync(
    entry,
    suite === 'owner' || suite === 'owner-soak'
      ? `import { runHydrationOwner, runHydrationOwnerSoak } from ${JSON.stringify(resolve(here, 'worker.ts'))}\n` +
          `import { createHydrationScripts } from ${JSON.stringify(join(sourceRoot, 'ssr/hydrationScripts.ts'))}\n` +
          `const values = Object.fromEntries(process.argv.slice(2).map((value) => value.replace(/^--/, '').split('=', 2)))\n` +
          `${suite === 'owner-soak' ? 'runHydrationOwnerSoak' : 'runHydrationOwner'}(createHydrationScripts, ${JSON.stringify(implementation)}, values.scenario)\n`
      : `import { run, runProbe } from ${JSON.stringify(resolve(here, 'worker.ts'))}\n` +
          `import { ${transformExportNames[implementation]} as transform } from ${JSON.stringify(join(sourceRoot, 'ssr/transformStreamWithRouter.ts'))}\n` +
          `const values = Object.fromEntries(process.argv.slice(2).map((value) => value.replace(/^--/, '').split('=', 2)))\n` +
          `if (values.probe) { runProbe(values.shape, Number(values.size), values.strategy) } else { await run(transform, ${JSON.stringify(implementation)}, values.scenario, values.mode) }\n`,
  )
  const outfile = join(temp, `${implementation}.mjs`)
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    logLevel: 'silent',
    nodePaths: dependencyNodePaths,
    plugins: [scriptStringPlugin],
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  return outfile
}

async function bundleWarmComparison() {
  const entry = join(temp, 'warm-comparison-entry.ts')
  writeFileSync(
    entry,
    suite === 'owner-warm'
      ? `import { runWarmHydrationOwnerComparison } from ${JSON.stringify(resolve(here, 'worker.ts'))}\n` +
          `import { createHydrationScripts as origin } from ${JSON.stringify(join(originSourceRoot, 'ssr/hydrationScripts.ts'))}\n` +
          `import { createHydrationScripts as worktree } from ${JSON.stringify(join(candidateSourceRoot, 'ssr/hydrationScripts.ts'))}\n` +
          `const values = Object.fromEntries(process.argv.slice(2).map((value) => value.replace(/^--/, '').split('=', 2)))\n` +
          `const result = runWarmHydrationOwnerComparison({ origin, worktree }, values.scenarios.split(','), Number(values.warmups), Number(values.iterations), Number(values.batchRequests))\n` +
          `process.stdout.write(JSON.stringify(result) + '\\n')\n`
      : `import { runWarmComparison } from ${JSON.stringify(resolve(here, 'worker.ts'))}\n` +
          `import { ${transformExportNames.origin} as origin } from ${JSON.stringify(join(originSourceRoot, 'ssr/transformStreamWithRouter.ts'))}\n` +
          `import { ${transformExportNames.worktree} as worktree } from ${JSON.stringify(join(candidateSourceRoot, 'ssr/transformStreamWithRouter.ts'))}\n` +
          `const values = Object.fromEntries(process.argv.slice(2).map((value) => value.replace(/^--/, '').split('=', 2)))\n` +
          `const result = await runWarmComparison({ origin, worktree }, values.scenarios.split(','), values.modes.split(','), Number(values.warmups), Number(values.iterations), Number(values.batchRequests))\n` +
          `process.stdout.write(JSON.stringify(result) + '\\n')\n`,
  )
  const outfile = join(temp, 'warm-comparison.mjs')
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    logLevel: 'silent',
    nodePaths: dependencyNodePaths,
    plugins: [scriptStringPlugin],
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  return outfile
}

function tasksForSuite() {
  if (suite === 'common') {
    return [
      'hydration-1k',
      'hydration-4k',
      'hydration-16k',
      'hydration-32k',
      'hydration-64k',
      'hydration-solid-32k',
      'hydration-vue-32k',
    ]
  }
  if (suite === 'safe-points') {
    return ['react-patches-64-records', 'solid-patches-64-records']
  }
  if (suite === 'coalesced-close') {
    return [
      'react-coalesced-early-script-1k',
      'react-coalesced-early-script-64k',
      'react-coalesced-next-close-64k',
      'react-coalesced-late-script-64k',
    ]
  }
  if (suite === 'small-memory') {
    return ['hydration-1k', 'hydration-4k']
  }
  if (suite === 'smoke') {
    return ['closing-heavy-17m']
  }
  if (suite === 'source') {
    return [
      'router-string-flat-1m',
      'router-string-flat-4m',
      'router-string-flat-17m',
      'router-string-flat-32m',
      'router-string-rope-1m',
      'router-string-rope-4m',
      'router-string-rope-17m',
      'router-string-rope-32m',
    ]
  }
  if (suite === 'strings') {
    return [
      'application-string-flat-1m',
      'application-string-flat-4m',
      'application-string-flat-17m',
      'application-string-rope-1m',
      'application-string-rope-4m',
      'application-string-rope-17m',
    ]
  }
  if (suite === 'owner' || suite === 'owner-warm') {
    return [
      'hydration-owner-1x1k',
      'hydration-owner-16x1k',
      'hydration-owner-400x40k',
      'hydration-owner-4095x4k',
    ]
  }
  if (suite === 'owner-soak') {
    return ['hydration-owner-16x1k', 'hydration-owner-4095x4k']
  }
  return [
    'hydration-32k',
    'hydration-17m',
    'router-records-15m',
    'closing-heavy-17m',
    'react18-patches-17m',
    'react19-patches-17m',
  ]
}

function writeSummary(results, path, warmComparison) {
  const provenance = [
    `Origin: ${originRef} (${originSha})`,
    `Candidate: ${candidateRef} (${candidateSha ?? `worktree snapshot ${candidateSourceSha256}`})`,
    `Node: ${process.version}; NODE_ENV=production`,
  ]
  if (warmComparison) {
    const lines = [
      '# Warm SSR streaming benchmark results',
      '',
      ...provenance,
      `Requests per timed batch: ${warmComparison.batchRequests}`,
      '',
      '| baseline | scenario | framework | safe point | mode | baseline mean us/request | candidate mean us/request | aggregate change | paired geometric mean | paired median | paired p10 | paired p90 | wall aggregate |',
      '| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ]
    for (const comparison of warmComparison.comparisons) {
      const baseline = results.find(
        (value) =>
          value.scenario === comparison.scenario &&
          value.framework === comparison.framework &&
          value.rendererSafePoint === comparison.rendererSafePoint &&
          value.mode === comparison.mode &&
          value.implementation === comparison.baseline &&
          value.comparisonBaseline === comparison.baseline,
      )
      const worktree = results.find(
        (value) =>
          value.scenario === comparison.scenario &&
          value.framework === comparison.framework &&
          value.rendererSafePoint === comparison.rendererSafePoint &&
          value.mode === comparison.mode &&
          value.implementation === 'worktree' &&
          value.comparisonBaseline === comparison.baseline,
      )
      if (!baseline || !worktree) {
        throw new Error(
          `Missing warm result row for ${comparison.scenario}/${comparison.framework}/${comparison.rendererSafePoint ?? '-'}/${comparison.mode}/${comparison.baseline}`,
        )
      }
      lines.push(
        `| ${comparison.baseline} | ${comparison.scenario} | ${comparison.framework} | ${comparison.rendererSafePoint ?? '-'} | ${comparison.mode} | ${(baseline.statistics.elapsedMs.mean * 1000).toFixed(2)} | ${(worktree.statistics.elapsedMs.mean * 1000).toFixed(2)} | ${comparison.aggregateElapsedPercent.toFixed(1)}% | ${comparison.pairedElapsedPercent.geometricMean.toFixed(1)}% | ${comparison.pairedElapsedPercent.median.toFixed(1)}% | ${comparison.pairedElapsedPercent.p10.toFixed(1)}% | ${comparison.pairedElapsedPercent.p90.toFixed(1)}% | ${comparison.aggregateWallElapsedPercent.toFixed(1)}% |`,
      )
    }
    writeFileSync(path, `${lines.join('\n')}\n`)
    return
  }

  const lines = [
    '# SSR streaming benchmark results',
    '',
    ...provenance,
    '',
    '| implementation | run | scenario | framework | safe point | mode | TTFB ms | first router ms | MiB/s | heap peak MiB | external peak MiB | max chunk | records HWM |',
    '| --- | ---: | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ]
  const soakRows = []
  for (const value of results) {
    if (value.outcome === 'expected-error') {
      lines.push(
        `| ${value.implementation} | ${value.run ?? '-'} | ${value.scenario} | ${value.framework} | ${value.rendererSafePoint ?? '-'} | ${value.mode} | - | - | expected guard | - | - | - | - |`,
      )
      continue
    }
    if (value.implementation === 'v8-probe') {
      for (const pass of value.passes) {
        lines.push(
          `| v8-probe | ${pass.pass} | ${value.scenario} | - | - | ${value.mode} | - | - | ${pass.throughputMiBPerSecond.toFixed(1)} | ${(pass.memoryPeakBytes.heapUsed / 1048576).toFixed(1)} | ${(pass.memoryPeakBytes.external / 1048576).toFixed(1)} | ${value.outputChunkBytes} | 0 |`,
        )
      }
      continue
    }
    if (value.mode === 'owner-soak') {
      soakRows.push(value)
      continue
    }
    lines.push(
      `| ${value.implementation} | ${value.run ?? '-'} | ${value.scenario} | ${value.framework} | ${value.rendererSafePoint ?? '-'} | ${value.mode} | ${value.ttfbMs?.toFixed(2) ?? '-'} | ${value.firstRouterScriptMs?.toFixed(2) ?? '-'} | ${value.throughputMiBPerSecond.toFixed(1)} | ${(value.memoryPeakBytes.heapUsed / 1048576).toFixed(1)} | ${(value.memoryPeakBytes.external / 1048576).toFixed(1)} | ${value.maxOutputChunkBytes} | ${value.sourceRecordHighWater} |`,
    )
  }
  if (soakRows.length > 0) {
    lines.push(
      '',
      '## Post-GC retention soak',
      '',
      '| implementation | run | scenario | requests | MiB/s including checkpoint GC | retained heap HWM MiB | retained external HWM MiB | retained ArrayBuffer HWM MiB |',
      '| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |',
    )
    for (const value of soakRows) {
      lines.push(
        `| ${value.implementation} | ${value.run ?? '-'} | ${value.scenario} | ${value.requests} | ${value.throughputIncludingGcMiBPerSecond.toFixed(1)} | ${(value.retainedHighWaterBytes.heapUsed / 1048576).toFixed(1)} | ${(value.retainedHighWaterBytes.external / 1048576).toFixed(1)} | ${(value.retainedHighWaterBytes.arrayBuffers / 1048576).toFixed(1)} |`,
      )
    }
  }
  writeFileSync(path, `${lines.join('\n')}\n`)
}

try {
  const bundles = {}
  for (const implementation of selectedImplementations) {
    bundles[implementation] = await bundle(implementation)
  }
  const scenarios = tasksForSuite().filter(
    (scenario) => !args.scenario || args.scenario.split(',').includes(scenario),
  )
  const supportedModes =
    suite === 'owner' || suite === 'owner-warm' || suite === 'owner-soak'
      ? ['owner']
      : suite === 'source' ||
          suite === 'strings' ||
          suite === 'safe-points' ||
          suite === 'coalesced-close'
        ? ['merge']
        : isWarmSuite
          ? ['fast', 'merge']
          : ['raw', 'fast', 'merge']
  const modes = supportedModes.filter(
    (mode) => !args.mode || args.mode.split(',').includes(mode),
  )
  const implementations = selectedImplementations
  const results = []
  const artifactPaths = { ...bundles }
  let warmComparison
  if (
    scenarios.length === 0 ||
    modes.length === 0 ||
    (!isWarmSuite && implementations.length === 0)
  ) {
    throw new Error('Benchmark filters selected no cells')
  }
  if (isWarmSuite) {
    const warmBundle = await bundleWarmComparison()
    artifactPaths['warm-comparison'] = warmBundle
    const focusedSafePoints =
      suite === 'safe-points' || suite === 'coalesced-close'
    const warmups = Number(args.warmups ?? (focusedSafePoints ? 20 : 50))
    const iterations = Number(args.iterations ?? (focusedSafePoints ? 20 : 50))
    const batchRequests = Number(
      args['batch-requests'] ?? (focusedSafePoints ? 250 : 1000),
    )
    if (
      scenarios.length === 0 ||
      !Number.isInteger(warmups) ||
      warmups < 0 ||
      !Number.isInteger(iterations) ||
      iterations < 1 ||
      !Number.isInteger(batchRequests) ||
      batchRequests < 1
    ) {
      throw new Error('Invalid warm-suite scenario or iteration count')
    }
    const child = spawnSync(
      process.execPath,
      [
        '--expose-gc',
        ...(profileDir
          ? [
              '--cpu-prof',
              `--cpu-prof-dir=${profileDir}`,
              `--cpu-prof-name=warm-${suite}.cpuprofile`,
            ]
          : []),
        warmBundle,
        `--scenarios=${scenarios.join(',')}`,
        `--modes=${modes.join(',')}`,
        `--warmups=${warmups}`,
        `--iterations=${iterations}`,
        `--batchRequests=${batchRequests}`,
      ],
      {
        cwd: repo,
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
        env: childEnvironment,
      },
    )
    if (child.status !== 0) {
      process.stderr.write(child.stderr)
      process.stderr.write(child.stdout)
      process.exit(child.status ?? 1)
    }
    warmComparison = JSON.parse(child.stdout.trim())
    if (warmComparison.comparisons.length === 0) {
      throw new Error('Benchmark filters selected no warm comparison cells')
    }
    results.push(...warmComparison.results)
    for (const comparison of warmComparison.comparisons) {
      process.stdout.write(
        `${comparison.baseline}->candidate ${comparison.scenario} ${comparison.framework} ${comparison.rendererSafePoint ?? 'no-extra-safe-point'} ${comparison.mode}: aggregate ${comparison.aggregateElapsedPercent.toFixed(1)}%, paired geometric mean ${comparison.pairedElapsedPercent.geometricMean.toFixed(1)}%\n`,
      )
    }
  }
  for (const scenario of scenarios) {
    const framework =
      scenario.startsWith('hydration-solid-') || scenario.startsWith('solid-')
        ? 'solid'
        : scenario.startsWith('hydration-vue-')
          ? 'vue'
          : 'react'
    const rendererSafePoint =
      framework === 'react'
        ? 'script-close'
        : framework === 'solid'
          ? 'record-end'
          : undefined
    for (const mode of modes) {
      for (let run = 1; run <= runs; run++) {
        const orders = [
          ['origin', 'worktree'],
          ['worktree', 'origin'],
        ]
        const implementationOrder = orders[(run - 1) % orders.length].filter(
          (implementation) => implementations.includes(implementation),
        )
        for (const implementation of implementationOrder) {
          const profileArgs = profileDir
            ? [
                '--cpu-prof',
                `--cpu-prof-dir=${profileDir}`,
                `--cpu-prof-name=${implementation}-${scenario}-${mode}-${run}.cpuprofile`,
              ]
            : []
          const child = spawnSync(
            process.execPath,
            [
              '--expose-gc',
              ...profileArgs,
              bundles[implementation],
              `--scenario=${scenario}`,
              `--mode=${mode}`,
            ],
            {
              cwd: repo,
              encoding: 'utf8',
              maxBuffer: 10 * 1024 * 1024,
              env: childEnvironment,
            },
          )
          if (child.status !== 0) {
            const expectedHistoricalLimit =
              mode !== 'merge' || !hasHistoricalBufferGuards[implementation]
                ? undefined
                : scenario === 'react18-patches-17m'
                  ? 'SSR stream tail exceeded maximum buffer'
                  : scenario === 'hydration-17m' ||
                      /^router-string-(flat|rope)-(17|32)m$/.test(scenario)
                    ? 'SSR router HTML exceeded maximum buffer'
                    : undefined
            const diagnostic = `${child.stderr}\n${child.stdout}`
            if (
              expectedHistoricalLimit &&
              diagnostic.includes(expectedHistoricalLimit)
            ) {
              results.push({
                implementation,
                scenario,
                framework,
                rendererSafePoint,
                mode,
                outcome: 'expected-error',
                error: expectedHistoricalLimit,
                run,
              })
              process.stdout.write(
                `${implementation} ${scenario} ${mode} ${run}/${runs}: expected historical buffer guard\n`,
              )
              continue
            }
            process.stderr.write(child.stderr)
            process.stderr.write(child.stdout)
            process.exit(child.status ?? 1)
          }
          const value = JSON.parse(child.stdout.trim())
          value.run = run
          results.push(value)
          const throughput =
            value.throughputMiBPerSecond ??
            value.throughputIncludingGcMiBPerSecond
          process.stdout.write(
            `${implementation} ${scenario} ${mode} ${run}/${runs}: ${throughput.toFixed(1)} MiB/s\n`,
          )
        }
      }
    }
  }
  if (suite === 'source' && !args.scenario && !args.mode) {
    for (const shape of ['flat', 'rope']) {
      for (const size of [1, 4, 17, 32]) {
        for (const strategy of ['suffix', 'window']) {
          const profileArgs = profileDir
            ? [
                '--cpu-prof',
                `--cpu-prof-dir=${profileDir}`,
                `--cpu-prof-name=probe-${shape}-${size}m-${strategy}.cpuprofile`,
              ]
            : []
          const child = spawnSync(
            process.execPath,
            [
              '--expose-gc',
              ...profileArgs,
              bundles.worktree ?? bundles.origin,
              '--probe=true',
              `--shape=${shape}`,
              `--size=${size}`,
              `--strategy=${strategy}`,
            ],
            {
              cwd: repo,
              encoding: 'utf8',
              maxBuffer: 10 * 1024 * 1024,
              env: childEnvironment,
            },
          )
          if (child.status !== 0) {
            process.stderr.write(child.stderr)
            process.stderr.write(child.stdout)
            process.exit(child.status ?? 1)
          }
          results.push(JSON.parse(child.stdout.trim()))
        }
      }
    }
  }
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(
    outputPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        node: process.version,
        nodeEnv: 'production',
        cpuProfiled,
        platform: { os: platform(), arch: arch(), cpu: cpus()[0]?.model },
        originRef,
        originSha,
        originSourceSha256,
        candidateRef,
        candidateSha,
        headSha,
        candidateSourceSha256,
        benchmarkInput:
          suite === 'strings'
            ? 'renderer string records'
            : suite.startsWith('owner')
              ? 'production hydration owner'
              : 'Uint8Array renderer records',
        measuredSourcePairSha256,
        artifactSha256: Object.fromEntries(
          Object.entries(artifactPaths)
            .map(([name, path]) => [
              name,
              createHash('sha256').update(readFileSync(path)).digest('hex'),
            ])
            .concat(
              profileDir
                ? readdirSync(profileDir)
                    .filter((name) => name.endsWith('.cpuprofile'))
                    .sort()
                    .map((name) => [
                      `profile:${name}`,
                      createHash('sha256')
                        .update(readFileSync(join(profileDir, name)))
                        .digest('hex'),
                    ])
                : [],
            ),
        ),
        suite,
        runs: isWarmSuite ? undefined : runs,
        warmComparison,
        results: isWarmSuite ? undefined : results,
      },
      null,
      2,
    )}\n`,
  )
  const summaryPath = outputPath.replace(/\.json$/, '.md')
  writeSummary(results, summaryPath, warmComparison)
  process.stdout.write(`Raw results: ${outputPath}\nSummary: ${summaryPath}\n`)
} finally {
  cleanupTemporaryArtifacts()
  process.removeListener('exit', cleanupTemporaryArtifacts)
}
