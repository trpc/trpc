import type { AddressInfo } from 'node:net'
import { Buffer } from 'node:buffer'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, request as httpRequest } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { brotliCompressSync, brotliDecompressSync, gunzipSync } from 'node:zlib'
import { RPCHandler } from '@orpc/server/node'
import { ResponseCompressionHandlerPlugin } from '@orpc/server/plugins'
import { StaticFileHandlerPlugin } from '../src'

/**
 * Driven over a raw socket rather than `fetch`, which negotiates its own encoding and
 * decompresses transparently, hiding exactly what this test needs to observe.
 */
it('works with the response compression plugin', async ({ onTestFinished }) => {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'orpc-node-compression-e2e-'))
  onTestFinished(() => {
    rmSync(rootDir, { recursive: true, force: true })
  })

  const script = `console.log(${'"padding",'.repeat(400)})`
  writeFileSync(path.join(rootDir, 'app.js'), script)
  writeFileSync(path.join(rootDir, 'tiny.txt'), 'small')
  writeFileSync(path.join(rootDir, 'photo.png'), Buffer.alloc(4096, 7))
  // A sidecar the static plugin serves directly, which compression must leave alone
  writeFileSync(path.join(rootDir, 'bundle.js'), script)
  writeFileSync(path.join(rootDir, 'bundle.js.br'), brotliCompressSync(script))

  const handler = new RPCHandler({}, {
    plugins: [
      new StaticFileHandlerPlugin({ rootDir, precompressed: true }),
      new ResponseCompressionHandlerPlugin({ threshold: 1024 }),
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

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo

  const get = (url: string, headers: Record<string, string> = {}) => new Promise<{
    status: number | undefined
    headers: Record<string, string | string[] | undefined>
    body: Buffer
  }>((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, path: url, headers }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }))
    })
    req.on('error', reject)
    req.end()
  })

  // A compressible file over the threshold is compressed on the way out
  const compressed = await get('/app.js', { 'accept-encoding': 'gzip' })
  expect(compressed.status).toBe(200)
  expect(compressed.headers['content-encoding']).toBe('gzip')
  expect(compressed.headers['content-type']).toBe('text/javascript; charset=utf-8')
  // A shared cache must key on the encoding, or it hands this body to a client that cannot decode it
  expect(compressed.headers.vary).toBe('accept-encoding')
  expect(gunzipSync(compressed.body).toString()).toBe(script)
  expect(compressed.body.length).toBeLessThan(script.length)

  // The same file is served verbatim when the client accepts no encoding
  const identity = await get('/app.js')
  expect(identity.status).toBe(200)
  expect(identity.headers['content-encoding']).toBeUndefined()
  expect(identity.body.toString()).toBe(script)

  // A precompressed sidecar is already encoded, so compression must not run again
  const sidecar = await get('/bundle.js', { 'accept-encoding': 'br, gzip' })
  expect(sidecar.status).toBe(200)
  expect(sidecar.headers['content-encoding']).toBe('br')
  // Both plugins ask to vary on the encoding, which must not accumulate duplicates
  expect(sidecar.headers.vary).toBe('accept-encoding')
  expect(brotliDecompressSync(sidecar.body).toString()).toBe(script)

  /**
   * A partial body is a byte range of the identity representation. Compressing it would leave
   * `Content-Range` describing offsets the client never receives, breaking range resumption.
   */
  const partial = await get('/app.js', { 'accept-encoding': 'gzip', 'range': 'bytes=0-99' })
  expect(partial.status).toBe(206)
  expect(partial.headers['content-encoding']).toBeUndefined()
  expect(partial.headers['content-range']).toBe(`bytes 0-99/${script.length}`)
  expect(partial.body.toString()).toBe(script.slice(0, 100))

  // A revalidation carries no body to compress
  const revalidated = await get('/app.js', {
    'accept-encoding': 'gzip',
    'if-none-match': identity.headers.etag as string,
  })
  expect(revalidated.status).toBe(304)
  expect(revalidated.headers['content-encoding']).toBeUndefined()
  expect(revalidated.body).toHaveLength(0)

  // Below the threshold, and a type that does not benefit, are both left alone
  const tiny = await get('/tiny.txt', { 'accept-encoding': 'gzip' })
  expect(tiny.status).toBe(200)
  expect(tiny.headers['content-encoding']).toBeUndefined()
  expect(tiny.body.toString()).toBe('small')

  const image = await get('/photo.png', { 'accept-encoding': 'gzip' })
  expect(image.status).toBe(200)
  expect(image.headers['content-encoding']).toBeUndefined()
  expect(image.body).toHaveLength(4096)
})
