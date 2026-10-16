import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { stripVTControlCharacters } from 'node:util'
import { appServerReadyPattern, test } from '@tanstack/router-e2e-utils'
import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

const fixtureRoot = path.resolve(import.meta.dirname, '..')
const workspaceRoot = path.resolve(import.meta.dirname, '../../../..')
const errorOverlaySelector = 'rsbuild-error-overlay'
const errorOverlayTimeout = 30_000
const syntaxErrorRoutePatch = '\nexport const broken = ;\n'
const devServerTimeout = 30_000

class DevServer {
  url = ''
  private stopPromise: Promise<void> | null = null
  private startupError: Error | null = null
  private readonly startupErrorPromise: Promise<never>

  private constructor(
    readonly port: number,
    private readonly childProcess: ReturnType<typeof spawn>,
  ) {
    let log = ''
    const captureAddress = (data: Buffer) => {
      log += data.toString()
      const match = appServerReadyPattern.exec(stripVTControlCharacters(log))
      if (match?.groups?.E2E_APP_PORT) {
        this.url = `http://localhost:${match.groups.E2E_APP_PORT}`
      }
    }
    this.childProcess.stdout?.on('data', captureAddress)
    this.childProcess.stderr?.on('data', captureAddress)
    this.startupErrorPromise = new Promise<never>((_, reject) => {
      this.childProcess.once('error', (error) => {
        this.startupError = error
        reject(this.createStartupError(error))
      })
    })
    this.startupErrorPromise.catch(() => {})
  }

  static async start(port: number): Promise<DevServer> {
    const devServer = new DevServer(
      port,
      spawn('pnpm', ['exec', 'rsbuild', 'dev', '--port', String(port)], {
        cwd: fixtureRoot,
        env: {
          ...process.env,
          PORT: String(port),
          VITE_SERVER_PORT: String(port),
          VITE_NODE_ENV: 'test',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    )

    try {
      await devServer.waitUntilReady()
      return devServer
    } catch (error) {
      await devServer.stop()
      throw error
    }
  }

  async waitUntilReady(timeoutMs = devServerTimeout): Promise<void> {
    const startedAt = Date.now()

    while (Date.now() - startedAt <= timeoutMs) {
      this.throwIfStartupFailed()

      if (this.childProcess.exitCode !== null) {
        throw new Error(
          `Dev server exited before responding: code=${this.childProcess.exitCode} signal=${this.childProcess.signalCode}`,
        )
      }

      try {
        const res = await this.awaitWithStartupFailure(
          fetch(this.url, {
            signal: AbortSignal.timeout(1000),
          }),
        )
        if (res.ok) {
          return
        }
      } catch {
        this.throwIfStartupFailed()
        // ignore
      }

      await this.awaitWithStartupFailure(this.delay(200))
    }

    throw new Error(`Timed out waiting for ${this.url}`)
  }

  private async awaitWithStartupFailure<T>(promise: Promise<T>): Promise<T> {
    this.throwIfStartupFailed()
    return await Promise.race([promise, this.startupErrorPromise])
  }

  private throwIfStartupFailed(): void {
    if (this.startupError) {
      throw this.createStartupError(this.startupError)
    }
  }

  private createStartupError(error: Error): Error {
    return new Error('Dev server failed to start', {
      cause: error,
    })
  }

  private async delay(ms: number): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, ms))
  }

  async stop(): Promise<void> {
    if (this.childProcess.exitCode !== null || this.childProcess.killed) {
      return
    }

    this.stopPromise ??= new Promise<void>((resolve) => {
      let resolved = false
      let forceKillTimer: ReturnType<typeof setTimeout> | null = null
      let forceResolveTimer: ReturnType<typeof setTimeout> | null = null

      const done = () => {
        if (resolved) {
          return
        }
        resolved = true

        if (forceKillTimer) {
          clearTimeout(forceKillTimer)
        }
        if (forceResolveTimer) {
          clearTimeout(forceResolveTimer)
        }

        this.childProcess.off('exit', done)
        this.childProcess.off('error', done)
        resolve()
      }

      this.childProcess.once('exit', done)
      this.childProcess.once('error', done)

      try {
        this.childProcess.kill('SIGTERM')
      } catch {
        done()
        return
      }

      forceKillTimer = setTimeout(() => {
        try {
          this.childProcess.kill('SIGKILL')
        } catch {
          // ignore
        }

        forceResolveTimer = setTimeout(done, 500)
      }, 3000)
    })

    await this.stopPromise
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.stop()
  }
}

type ErrorOverlayIssue = {
  title: string | null
  description: string | null
  runtime: 'client' | 'server' | null
  sourceFrame: string | null
  importTrace: Array<string>
}

const runtimeTraceEntries = [
  ['/default-entry/client.tsx', 'client'],
  ['/default-entry/server.ts', 'server'],
] as const

function normalizeErrorOverlayText(value: string): string {
  return value
    .replaceAll(fixtureRoot, '<fixture-root>')
    .replaceAll(workspaceRoot, '<workspace-root>')
    .replace(
      /from [^)]+@rsbuild\/core\/dist\/transformLoader\.mjs/g,
      'from <rsbuild-transform-loader>',
    )
    .replaceAll('\u00d7', 'x')
    .replaceAll('\u2570\u2500\u25b6', '->')
    .replaceAll('\u2026', '...')
    .replaceAll('\u2192', '->')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function readErrorOverlay(page: Page): Promise<{
  title: string | null
  content: string
}> {
  const snapshot = await page
    .locator(errorOverlaySelector)
    .evaluate((element) => {
      const root = (element as HTMLElement).shadowRoot ?? element
      const titleElement = root.querySelector('.title')
      const contentElement = root.querySelector('.content')
      const titleText = titleElement ? titleElement.textContent : null
      const contentText = contentElement
        ? contentElement.textContent
        : root.textContent

      return {
        title: titleText === null ? null : titleText.trim(),
        content: contentText,
      }
    })

  return {
    title: snapshot.title,
    content: normalizeErrorOverlayText(snapshot.content),
  }
}

function getErrorRuntime(block: string): ErrorOverlayIssue['runtime'] {
  return (
    runtimeTraceEntries.find(([traceEntry]) =>
      block.includes(traceEntry),
    )?.[1] ?? null
  )
}

function findTrimmedLine(lines: Array<string>, text: string): string | null {
  return lines.find((line) => line.includes(text))?.trim() ?? null
}

function getSyntaxErrorDescription(lines: Array<string>): string | null {
  return (
    findTrimmedLine(lines, 'SyntaxError:')
      ?.replace(/^.*SyntaxError:/, 'SyntaxError:')
      .trim() ?? null
  )
}

function getSourceFrame(lines: Array<string>): string | null {
  const sourceFrame = [
    lines[0]?.trim(),
    findTrimmedLine(lines, 'Module build failed'),
    findTrimmedLine(lines, 'SyntaxError:'),
  ].filter(Boolean)

  return sourceFrame.length > 0 ? sourceFrame.join('\n') : null
}

function getImportTrace(lines: Array<string>): Array<string> {
  const traceStartIndex = lines.findIndex((line) =>
    line.startsWith('Import traces'),
  )

  if (traceStartIndex === -1) {
    return []
  }

  return lines
    .slice(traceStartIndex + 1)
    .map((line) => line.trim())
    .filter(Boolean)
}

function parseErrorOverlayIssue(
  block: string,
  title: string | null,
): ErrorOverlayIssue {
  const lines = block.split('\n')

  return {
    title,
    description: getSyntaxErrorDescription(lines),
    runtime: getErrorRuntime(block),
    sourceFrame: getSourceFrame(lines),
    importTrace: getImportTrace(lines),
  }
}

async function captureErrorOverlaySnapshot(
  page: Page,
): Promise<Array<ErrorOverlayIssue>> {
  const { title, content } = await readErrorOverlay(page)
  const blocks = content.split(/\n(?=File: )/).filter(Boolean)

  return blocks.map((block) => parseErrorOverlayIssue(block, title))
}

function formatErrorOverlaySnapshot(
  snapshot: Array<ErrorOverlayIssue>,
): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`
}

function dedentSnapshot(snapshot: string): string {
  const lines = snapshot
    .replace(/^\n/, '')
    .replace(/\n\s*$/, '')
    .split('\n')
  const indent = Math.min(
    ...lines
      .filter((line) => line.trim() !== '')
      .map((line) => line.match(/^ */)?.[0].length ?? 0),
  )

  return `${lines.map((line) => line.slice(indent)).join('\n')}\n`
}

async function toDisplayRedbox(
  page: Page,
  expectedSnapshot: string,
): Promise<void> {
  await expect(page.locator(errorOverlaySelector)).toBeAttached({
    timeout: errorOverlayTimeout,
  })

  const normalizedExpectedSnapshot = dedentSnapshot(expectedSnapshot)

  await expect
    .poll(
      async () => {
        return formatErrorOverlaySnapshot(
          await captureErrorOverlaySnapshot(page),
        )
      },
      { timeout: errorOverlayTimeout },
    )
    .toBe(normalizedExpectedSnapshot)
}

test.use({
  whitelistErrors: [
    'Build failed',
    'Module build failed',
    'SyntaxError',
    'Syntax Error',
    'Expression expected',
  ],
})

test('shows a module syntax error through the error overlay', async ({
  page,
}) => {
  const homeRouteFile = path.resolve(fixtureRoot, 'src/routes/index.tsx')
  const originalSource = await fs.promises.readFile(homeRouteFile, 'utf-8')
  const port = 0
  await using devServer = await DevServer.start(port)

  try {
    await page.goto(devServer.url, { waitUntil: 'domcontentloaded' })

    await fs.promises.writeFile(
      homeRouteFile,
      `${originalSource}${syntaxErrorRoutePatch}`,
    )

    await toDisplayRedbox(
      page,
      `
      [
        {
          "title": "Build failed",
          "description": "SyntaxError: Unexpected token (16:22)",
          "runtime": "client",
          "sourceFrame": "File: ./src/routes/index.tsx:1:1\\nx Module build failed (from <rsbuild-transform-loader>):\\n->   x SyntaxError: Unexpected token (16:22)",
          "importTrace": [
            "../../../packages/react-start/dist/plugin/default-entry/client.tsx",
            "../../../packages/react-start/dist/esm/client.js",
            "... (5 hidden)",
            "./src/routeTree.gen.ts",
            "./src/routes/index.tsx x"
          ]
        },
        {
          "title": "Build failed",
          "description": "SyntaxError: Unexpected token (16:22)",
          "runtime": "server",
          "sourceFrame": "File: ./src/routes/index.tsx:1:1\\nx Module build failed (from <rsbuild-transform-loader>):\\n->   x SyntaxError: Unexpected token (16:22)",
          "importTrace": [
            "../../../packages/react-start/dist/plugin/default-entry/server.ts",
            "../../../packages/react-start/dist/esm/server.js",
            "... (4 hidden)",
            "./src/routeTree.gen.ts",
            "./src/routes/index.tsx x"
          ]
        }
      ]
    `,
    )
  } finally {
    await fs.promises.writeFile(homeRouteFile, originalSource)
  }
})
