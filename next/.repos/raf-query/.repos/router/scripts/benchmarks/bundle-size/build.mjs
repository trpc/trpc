import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))

/**
 * Run report generation outside Nx so it also runs after a cache hit.
 * @param {string[]} args
 * @param {import('./run.mjs').Execute} [execute]
 */
export function build(args, execute = spawnSync) {
  const pnpmPath = process.env.npm_execpath
  /** @type {import('./run.mjs').CommandOptions} */
  const options = { cwd: repoRoot, env: process.env, stdio: 'inherit' }
  const result = execute(
    pnpmPath
      ? process.execPath
      : process.platform === 'win32'
        ? 'pnpm.cmd'
        : 'pnpm',
    [
      ...(pnpmPath ? [pnpmPath] : []),
      'nx',
      'run',
      '@benchmarks/bundle-size:build',
      ...args,
    ],
    options,
  )
  if (result.status !== 0) {
    return result.status || 1
  }
  const report = execute(
    process.execPath,
    [fileURLToPath(new URL('./report.mjs', import.meta.url))],
    options,
  )
  return report.status ?? 1
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  process.exitCode = build(process.argv.slice(2))
}
