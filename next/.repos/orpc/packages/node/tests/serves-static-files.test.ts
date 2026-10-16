import type { AddressInfo } from 'node:net'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { os } from '@orpc/server'
import { RPCHandler } from '@orpc/server/node'
import { StaticFileHandlerPlugin } from '../src'

it('serves static files', async ({ onTestFinished }) => {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'orpc-node-e2e-'))
  onTestFinished(() => {
    rmSync(rootDir, { recursive: true, force: true })
  })

  writeFileSync(path.join(rootDir, 'hello.txt'), 'hello world')

  const handler = new RPCHandler({
    ping: os.handler(() => 'pong'),
  }, {
    allowMethods: ['GET'],
    plugins: [
      new StaticFileHandlerPlugin({ rootDir }),
    ],
  })

  const server = createServer(async (req, res) => {
    const result = await handler.handle(req, res, { context: {} })

    if (!result.matched) {
      res.statusCode = 404
      res.end('not matched')
    }
  })
  onTestFinished(() => {
    server.close()
  })

  await new Promise<void>(resolve => server.listen(0, resolve))
  const url = `http://localhost:${(server.address() as AddressInfo).port}`

  const fileRes = await fetch(`${url}/hello.txt`)
  expect(fileRes.status).toBe(200)
  expect(await fileRes.text()).toBe('hello world')
  expect(fileRes.headers.get('content-type')).toBe('text/plain; charset=utf-8')
  expect(fileRes.headers.get('etag')).toMatch(/^"/)

  /**
   * Regression only reproducible with a real fetch client: it sends
   * `cache-control: no-cache` alongside its conditional headers,
   * which must not prevent the 304 revalidation.
   */
  const cachedRes = await fetch(`${url}/hello.txt`, {
    headers: { 'if-none-match': fileRes.headers.get('etag')! },
  })
  expect(cachedRes.status).toBe(304)
  expect(await cachedRes.text()).toBe('')

  const procedureRes = await fetch(`${url}/ping?data=${encodeURIComponent(JSON.stringify({ json: null }))}`)
  expect(procedureRes.status).toBe(200)
  expect(await procedureRes.text()).toContain('pong')

  const missingRes = await fetch(`${url}/missing.txt`)
  expect(missingRes.status).toBe(404)
  expect(await missingRes.text()).toBe('not matched')
})
