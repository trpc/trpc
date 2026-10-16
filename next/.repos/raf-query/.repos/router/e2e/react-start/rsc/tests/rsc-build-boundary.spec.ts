import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'

// This marker deliberately lives behind a server-only route. If its route
// dependency graph enters the RSC build, the emitted-file assertion will fail.
const SENTINEL = 'tanstack-start-rsc-server-only-route-sentinel'
const EXECUTABLE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs'])

const distDir = path.resolve(process.cwd(), process.env.E2E_DIST_DIR ?? 'dist')
const serverDir = path.join(distDir, 'server')
const rscDir = path.join(serverDir, 'rsc')

async function findExecutableFiles(
  directory: string,
  excludedDirectories = new Set<string>(),
): Promise<Array<string>> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files: Array<string> = []

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name)

    if (entry.isDirectory()) {
      if (!excludedDirectories.has(entryPath)) {
        files.push(
          ...(await findExecutableFiles(entryPath, excludedDirectories)),
        )
      }
    } else if (
      entry.isFile() &&
      EXECUTABLE_EXTENSIONS.has(path.extname(entry.name))
    ) {
      files.push(entryPath)
    }
  }

  return files.sort()
}

async function findSentinelMatches(files: Array<string>) {
  const matches: Array<string> = []

  for (const file of files) {
    if ((await readFile(file, 'utf-8')).includes(SENTINEL)) {
      matches.push(path.relative(distDir, file))
    }
  }

  return matches
}

test('server-only route dependencies stay out of the RSC build output', async ({
  request,
}) => {
  test.skip(
    (process.env.E2E_TOOLCHAIN ?? 'vite') !== 'vite',
    'Vite emits the RSC environment as a separate output directory',
  )

  const response = await request.get('/api/rsc-build-boundary')
  expect(response.ok()).toBe(true)
  expect(await response.text()).toBe(SENTINEL)

  const [ssrFiles, rscFiles] = await Promise.all([
    findExecutableFiles(serverDir, new Set([rscDir])),
    findExecutableFiles(rscDir),
  ])
  const [ssrMatches, rscMatches] = await Promise.all([
    findSentinelMatches(ssrFiles),
    findSentinelMatches(rscFiles),
  ])

  expect(
    ssrMatches,
    `Expected the sentinel in the SSR output. Scanned files:\n${ssrFiles
      .map((file) => path.relative(distDir, file))
      .join('\n')}`,
  ).not.toEqual([])
  expect(
    rscMatches,
    `The server-only route dependency leaked into these RSC files:\n${rscMatches.join(
      '\n',
    )}`,
  ).toEqual([])
})
