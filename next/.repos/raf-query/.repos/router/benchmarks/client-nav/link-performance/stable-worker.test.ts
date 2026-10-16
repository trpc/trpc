import { fork } from 'node:child_process'
import { rmdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { createStagingDirectory } from './staging'
import type { WorkerResponse } from './worker-protocol'

test('loads emitted JavaScript without retranspiling it through SWC', async () => {
  const directory = createStagingDirectory()
  const bundle = join(directory, 'app.mjs')
  const definition = 'function untouched ( ) { return 1 }'
  writeFileSync(
    bundle,
    `${definition}\nawait Promise.resolve()\nthrow new Error(untouched.toString())`,
  )
  const worker = fork(
    fileURLToPath(new URL('./stable-worker.ts', import.meta.url)),
    {
      cwd: fileURLToPath(new URL('../../../', import.meta.url)),
      execArgv: ['--import=@swc-node/register/esm-register'],
      env: { ...process.env, NODE_ENV: 'production' },
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    },
  )
  let stderr = ''
  worker.stderr?.on('data', (data: Buffer) => {
    stderr += data.toString()
  })
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    const result = new Promise<WorkerResponse>((resolve, reject) => {
      worker.once('message', (message: WorkerResponse) => resolve(message))
      worker.once('error', reject)
      worker.once('exit', (code) => {
        reject(new Error(`Worker exited (${code}): ${stderr}`))
      })
      timeout = setTimeout(() => {
        reject(new Error(`Worker timed out: ${stderr}`))
      }, 5_000)
    })
    worker.send({
      kind: 'init',
      mode: 'ssr',
      caseId: 'shared-params',
      bundle,
      variant: 0,
    })
    const response = await result
    expect(response.kind).toBe('error')
    if (response.kind === 'error') {
      expect(response.message).toContain(`Error: ${definition}`)
    }
  } finally {
    clearTimeout(timeout)
    worker.kill()
    unlinkSync(bundle)
    rmdirSync(directory)
  }
})
