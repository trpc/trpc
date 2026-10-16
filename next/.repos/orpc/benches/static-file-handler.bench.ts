import type { StandardLazyRequest } from '@standard-server/core'
import { Buffer } from 'node:buffer'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { StaticFileHandlerPlugin } from '@orpc/node'
import { RPCHandlerCodec, StandardHandler } from '@orpc/server/standard'
import { bench } from 'vitest'
import { drainBody } from './__shared__/payloads'

const rootDir = mkdtempSync(path.join(tmpdir(), 'orpc-static-file-bench-'))

writeFileSync(path.join(rootDir, 'file.txt'), Buffer.alloc(10 * 1024, 'a'))
mkdirSync(path.join(rootDir, 'deeply', 'nested', 'dir'), { recursive: true })
writeFileSync(path.join(rootDir, 'deeply', 'nested', 'dir', 'file.txt'), Buffer.alloc(10 * 1024, 'a'))

const handler = new StandardHandler(new RPCHandlerCodec({}, {}), {
  plugins: [new StaticFileHandlerPlugin({ rootDir })],
})

function createRequest(url: `/${string}`, headers: Record<string, string> = {}): StandardLazyRequest {
  return {
    url,
    method: 'GET',
    headers,
    resolveBody: () => Promise.resolve(undefined),
  }
}

const { response } = await handler.handle(createRequest('/file.txt'), { context: {} })
await drainBody(response!.body)
const etag = response!.headers.etag as string

describe('static file handler plugin', () => {
  bench('serve file', async () => {
    const { response } = await handler.handle(createRequest('/file.txt'), { context: {} })
    await drainBody(response!.body)
  })

  bench('serve deeply nested encoded path', async () => {
    const { response } = await handler.handle(createRequest('/deeply/nested/dir/file%2etxt'), { context: {} })
    await drainBody(response!.body)
  })

  bench('range request', async () => {
    const { response } = await handler.handle(createRequest('/file.txt', { range: 'bytes=0-1023' }), { context: {} })
    await drainBody(response!.body)
  })

  bench('not modified (304)', async () => {
    await handler.handle(createRequest('/file.txt', { 'if-none-match': etag }), { context: {} })
  })

  bench('not found fall through', async () => {
    await handler.handle(createRequest('/missing/file.txt'), { context: {} })
  })
})
