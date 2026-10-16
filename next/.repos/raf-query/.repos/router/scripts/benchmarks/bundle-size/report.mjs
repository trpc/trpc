import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))

function getGitStatus() {
  try {
    return {
      branch: execFileSync('git', ['branch', '--show-current'], {
        cwd: repoRoot,
        encoding: 'utf8',
      }).trim(),
      dirty:
        execFileSync('git', ['status', '--porcelain'], {
          cwd: repoRoot,
          encoding: 'utf8',
        }).trim().length > 0,
    }
  } catch {
    return { branch: '', dirty: undefined }
  }
}

/**
 * Attach the current checkout's metadata after Nx has restored measurements.
 * The measurement time and duration still describe the original build.
 * @param {string} resultsDir
 * @param {{ sha?: string }} [options]
 */
export function writeReport(resultsDir, { sha: providedSha } = {}) {
  const measurements = JSON.parse(
    fs.readFileSync(path.join(resultsDir, 'measurements.json'), 'utf8'),
  )
  const sha =
    providedSha ||
    process.env.GITHUB_SHA ||
    execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim()
  const report = {
    ...measurements,
    generatedAt: new Date().toISOString(),
    sha,
    status: {
      ...measurements.status,
      git: { sha, ...getGitStatus() },
    },
  }
  fs.writeFileSync(
    path.join(resultsDir, 'current.json'),
    JSON.stringify(report, null, 2) + '\n',
  )
  return report
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  try {
    const { values } = parseArgs({
      options: {
        'results-dir': { type: 'string' },
        sha: { type: 'string' },
      },
    })
    const resultsDir = values['results-dir']
      ? path.resolve(values['results-dir'])
      : path.join(repoRoot, 'benchmarks/bundle-size/results')
    writeReport(resultsDir, { sha: values.sha })
    console.log(
      `Wrote ${path.relative(repoRoot, path.join(resultsDir, 'current.json'))}`,
    )
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
