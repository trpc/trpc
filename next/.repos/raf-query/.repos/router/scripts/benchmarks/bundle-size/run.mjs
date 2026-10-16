#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '../../..')

/**
 * @typedef {object} CommandOptions
 * @property {string} cwd
 * @property {NodeJS.ProcessEnv} env
 * @property {'inherit' | ['ignore', number, number]} stdio
 * @typedef {(command: string, args: string[], options: CommandOptions) => {status: number | null, error?: Error, signal?: string | null}} Execute
 */

/**
 * @param {string} resultsRoot
 * @param {string} name
 */
function namedRunDir(resultsRoot, name) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(name)) {
    throw new Error(
      'Run names must start with a letter or digit and contain only letters, digits, hyphens, or underscores.',
    )
  }
  return path.join(resultsRoot, 'runs', name)
}

/**
 * @param {string[]} argv
 * @param {Execute} [execute]
 */
export function run(argv, execute = spawnSync) {
  const separator = argv.indexOf('--')
  const testArgs = separator === -1 ? [] : argv.slice(separator + 1)
  const { values } = parseArgs({
    args: separator === -1 ? argv : argv.slice(0, separator),
    allowPositionals: false,
    options: {
      name: { type: 'string' },
      baseline: { type: 'string' },
      'test-projects': { type: 'string' },
      scenario: { type: 'string' },
      'results-dir': { type: 'string' },
      'dist-dir': { type: 'string' },
      analysis: { type: 'boolean' },
      sourcemap: { type: 'boolean' },
      timings: { type: 'boolean' },
      'skip-package-builds': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  })

  if (values.help) {
    console.log(`Usage: pnpm benchmark:bundle-size:run [options] [-- test arguments]

  --scenario <ids>          Comma-separated scenarios; omit for all scenarios
  --name <name>             Save a named run; existing results are not overwritten
  --baseline <name|file>    Compare against a named run or a current.json file
  --test-projects <names>   Run Nx unit tests before measurement
  --results-dir <dir>       Results root (default: benchmarks/bundle-size/results)
  --dist-dir <dir>          Override the emitted bundle directory
  --analysis               Include source attribution in current.json
  --sourcemap              Emit hidden source maps
  --timings                Record fresh phase timings in measure.log
  --skip-package-builds    Reuse package builds only when they are unchanged

Named runs use <results-root>/runs/<name>/current.json.
Without --name, current.json is replaced in the results root.
Logs stay beside current.json; failures print a bounded log tail.
With --scenario, comparisons report only the scenarios measured in this run.
Arguments after -- go to the selected unit tests, not the measurement.`)
    return 0
  }

  if (testArgs.length > 0 && !values['test-projects']) {
    throw new Error('Test arguments after -- require --test-projects.')
  }
  if (
    values['test-projects'] !== undefined &&
    !values['test-projects'].split(',').some((name) => name.trim())
  ) {
    throw new Error('--test-projects requires at least one project.')
  }
  if (
    values.scenario !== undefined &&
    !values.scenario.split(',').some((name) => name.trim())
  ) {
    throw new Error('--scenario requires at least one scenario.')
  }

  const resultsRoot = values['results-dir']
    ? path.resolve(values['results-dir'])
    : path.join(repoRoot, 'benchmarks/bundle-size/results')
  const resultsDir =
    values.name === undefined
      ? resultsRoot
      : namedRunDir(resultsRoot, values.name)
  const currentPath = path.join(resultsDir, 'current.json')
  let baselinePath

  if (values.name !== undefined && fs.existsSync(currentPath)) {
    throw new Error(`Named run already exists: ${values.name}`)
  }
  if (values.baseline !== undefined) {
    baselinePath = fs.realpathSync(
      /[/\\]|\.json$/i.test(values.baseline)
        ? path.resolve(values.baseline)
        : path.join(namedRunDir(resultsRoot, values.baseline), 'current.json'),
    )
    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
    if (!Array.isArray(baseline.metrics) || baseline.metrics.length === 0) {
      throw new Error(`Baseline contains no metrics: ${baselinePath}`)
    }
    if (
      fs.existsSync(currentPath) &&
      fs.realpathSync(currentPath) === baselinePath
    ) {
      throw new Error(
        'The baseline cannot be the current output. Use --name to save it first.',
      )
    }
  }

  fs.mkdirSync(resultsDir, { recursive: true })
  const env = {
    ...process.env,
    CI: '1',
    NX_DAEMON: 'false',
    FORCE_COLOR: '0',
  }

  /**
   * @param {string} label
   * @param {string} command
   * @param {string[]} args
   */
  function step(label, command, args, logged = true) {
    const logPath = path.join(resultsDir, `${label}.log`)
    const fd = logged ? fs.openSync(logPath, 'w') : undefined
    let result
    try {
      if (logged) {
        console.error(`${label}: ${path.relative(repoRoot, logPath)}`)
      }
      result = execute(command, args, {
        cwd: repoRoot,
        env,
        stdio: fd === undefined ? 'inherit' : ['ignore', fd, fd],
      })
    } finally {
      if (fd !== undefined) {
        fs.closeSync(fd)
      }
    }

    if (result.error || result.status !== 0) {
      console.error(
        `${label} failed: ${result.error?.message || result.signal || `exit ${result.status}`}`,
      )
      if (logged) {
        const tail = fs
          .readFileSync(logPath, 'utf8')
          .slice(-8000)
          .trimEnd()
          .split(/\r?\n/)
          .slice(-40)
          .join('\n')
        if (tail) {
          console.error(tail)
        }
      }
      return result.status || 1
    }
    return 0
  }

  if (values['test-projects']) {
    const pnpmPath = process.env.npm_execpath
    const status = step(
      'tests',
      pnpmPath
        ? process.execPath
        : process.platform === 'win32'
          ? 'pnpm.cmd'
          : 'pnpm',
      [
        ...(pnpmPath ? [pnpmPath] : []),
        'nx',
        'run-many',
        '--target=test:unit',
        `--projects=${values['test-projects']}`,
        '--parallel=1',
        '--outputStyle=stream',
        '--skipRemoteCache',
        ...(testArgs.length > 0 ? ['--', ...testArgs] : []),
      ],
    )
    if (status !== 0) {
      return status
    }
  }

  const measureArgs = [
    path.join(scriptDir, 'measure.mjs'),
    '--results-dir',
    resultsDir,
  ]
  for (const [option, value] of Object.entries({
    scenario: values.scenario,
    'dist-dir':
      values['dist-dir'] === undefined
        ? undefined
        : path.resolve(values['dist-dir']),
  })) {
    if (value !== undefined) {
      measureArgs.push(`--${option}`, value)
    }
  }
  for (const [option, value] of Object.entries({
    analysis: values.analysis,
    sourcemap: values.sourcemap,
    timings: values.timings,
    'skip-package-builds': values['skip-package-builds'],
  })) {
    if (value) {
      measureArgs.push(`--${option}`)
    }
  }

  const status = step('measure', process.execPath, measureArgs)
  if (status !== 0) {
    return status
  }

  return step(
    'report',
    process.execPath,
    [
      path.join(scriptDir, baselinePath ? 'diff.mjs' : 'query.mjs'),
      '--current',
      currentPath,
      ...(baselinePath ? ['--baseline', baselinePath] : []),
      ...(baselinePath && values.scenario ? ['--current-only'] : []),
    ],
    false,
  )
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  try {
    process.exitCode = run(process.argv.slice(2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
