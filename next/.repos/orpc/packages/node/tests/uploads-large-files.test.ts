import type { RouterClient } from '@orpc/server'
import type { AddressInfo } from 'node:net'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import { RequestCompressionLinkPlugin } from '@orpc/client/plugins'
import { os, type } from '@orpc/server'
import { RPCHandler } from '@orpc/server/node'
import { RequestCompressionHandlerPlugin, RequestLimitHandlerPlugin } from '@orpc/server/plugins'
import { TmpFile, TmpFileUploadHandlerPlugin } from '../src'

/**
 * Driven through a real http server and `RPCLink`, so uploads take the exact
 * wire format real clients produce.
 */
describe('uploads large files through tmp files', () => {
  const UNLIMITED = {
    memory: Number.POSITIVE_INFINITY,
    file: Number.POSITIVE_INFINITY,
    stream: Number.POSITIVE_INFINITY,
  }

  const tmpDir = mkdtempSync(path.join(tmpdir(), 'orpc-upload-e2e-'))

  const router = {
    upload: os.input(type<File | { file: File }>()).handler(async ({ input }) => {
      const file = input instanceof File ? input : input.file

      return {
        isFile: file instanceof File,
        isTmpFile: file instanceof TmpFile,
        name: file.name,
        type: file.type,
        size: file.size,
        // Read from disk while the request is still running, in constant memory
        sha256: createHash('sha256').update(new Uint8Array(await file.arrayBuffer())).digest('hex'),
        spooledSize: file instanceof TmpFile ? statSync(file.path).size : undefined,
        spooledInsideTmpDir: file instanceof TmpFile && path.dirname(path.dirname(file.path)) === tmpDir,
      }
    }),
  }

  const handler = new RPCHandler(router, {
    plugins: [
      new TmpFileUploadHandlerPlugin({ tmpDir }),
      new RequestCompressionHandlerPlugin(),
      new RequestLimitHandlerPlugin({ maxBodySize: 256 * 1024 * 1024 }),
    ],
  })

  const server = createServer(async (req, res) => {
    const result = await handler.handle(req, res, { context: {} })

    if (!result.matched) {
      res.statusCode = 404
      res.end('not matched')
    }
  })

  let url: string

  beforeAll(async () => {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(() => {
    server.close()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  function createClient(linkPlugins: ConstructorParameters<typeof RPCLink>[0]['plugins'] = []): RouterClient<typeof router> {
    return createORPCClient(new RPCLink({ url: '/', origin: url, plugins: linkPlugins }))
  }

  function randomContent(size: number): Uint8Array<ArrayBuffer> {
    const content = new Uint8Array(size)
    let seed = 42
    for (let i = 0; i < size; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0
      content[i] = seed
    }
    return content
  }

  it('uploads a 32MB file nested in the input through multipart', async () => {
    const content = randomContent(32 * 1024 * 1024)
    const client = createClient()

    const output = await client.upload({
      file: new File([content], 'video 🚀.mp4', { type: 'video/mp4' }),
    })

    expect(output).toEqual({
      isFile: true,
      isTmpFile: true,
      name: 'video 🚀.mp4',
      type: 'video/mp4',
      size: content.length,
      sha256: createHash('sha256').update(content).digest('hex'),
      spooledSize: content.length,
      spooledInsideTmpDir: true,
    })

    expect(readdirSync(tmpDir)).toHaveLength(0)
  })

  it('uploads a file as the whole request body', async () => {
    const content = randomContent(4 * 1024 * 1024)
    const client = createClient()

    const output = await client.upload(new File([content], 'ảnh chụp.png', { type: 'image/png' }))

    expect(output).toMatchObject({
      isTmpFile: true,
      name: 'ảnh chụp.png',
      type: 'image/png',
      sha256: createHash('sha256').update(content).digest('hex'),
      spooledInsideTmpDir: true,
    })

    expect(readdirSync(tmpDir)).toHaveLength(0)
  })

  it('spools the decompressed bytes when the request is compressed', async () => {
    const content = new Uint8Array(2 * 1024 * 1024).fill(42)
    const client = createClient([new RequestCompressionLinkPlugin()])

    const output = await client.upload({
      file: new File([content], 'compressible.txt', { type: 'text/plain' }),
    })

    expect(output).toMatchObject({
      isTmpFile: true,
      sha256: createHash('sha256').update(content).digest('hex'),
      spooledSize: content.length,
    })

    expect(readdirSync(tmpDir)).toHaveLength(0)
  })

  it('runs concurrent uploads in isolated directories and removes them all', async () => {
    const client = createClient()

    const outputs = await Promise.all(Array.from({ length: 5 }, (_, i) => {
      const content = new Uint8Array(512 * 1024 + i).fill(i)
      return client.upload({ file: new File([content], `file-${i}.bin`, { type: 'application/octet-stream' }) })
    }))

    for (let i = 0; i < outputs.length; i++) {
      expect(outputs[i]).toMatchObject({ isTmpFile: true, size: 512 * 1024 + i, spooledInsideTmpDir: true })
    }

    expect(readdirSync(tmpDir)).toHaveLength(0)
  })

  it('removes spooled bytes when the request exceeds the body limit mid-stream', async () => {
    const limitedTmpDir = mkdtempSync(path.join(tmpdir(), 'orpc-upload-e2e-limited-'))
    const limitedHandler = new RPCHandler(router, {
      plugins: [
        new TmpFileUploadHandlerPlugin({ tmpDir: limitedTmpDir }),
        new RequestCompressionHandlerPlugin(),
        // The compressed request carries no content-length, so the limit only trips while spooling
        new RequestLimitHandlerPlugin({ maxBodySize: 64 * 1024 }),
      ],
    })

    const limitedServer = createServer(async (req, res) => {
      await limitedHandler.handle(req, res, { context: {} })
    })

    try {
      await new Promise<void>(resolve => limitedServer.listen(0, '127.0.0.1', resolve))
      const limitedUrl = `http://127.0.0.1:${(limitedServer.address() as AddressInfo).port}`
      const client: RouterClient<typeof router> = createORPCClient(new RPCLink({
        url: '/',
        origin: limitedUrl,
        plugins: [new RequestCompressionLinkPlugin()],
      }))

      const content = new Uint8Array(2 * 1024 * 1024).fill(7)
      await expect(client.upload({ file: new File([content], 'too-large.bin') })).rejects.toThrow()

      // Whatever was spooled before the limit tripped must be removed
      await vi.waitFor(() => {
        expect(readdirSync(limitedTmpDir)).toHaveLength(0)
      })
    }
    finally {
      limitedServer.close()
      rmSync(limitedTmpDir, { recursive: true, force: true })
    }
  })

  it('rejects uploads over its own file limit without the request limit plugin', async () => {
    const limitedTmpDir = mkdtempSync(path.join(tmpdir(), 'orpc-upload-e2e-own-limit-'))
    const limitedHandler = new RPCHandler(router, {
      plugins: [new TmpFileUploadHandlerPlugin({ tmpDir: limitedTmpDir, maxBodySize: { ...UNLIMITED, file: 64 * 1024 } })],
    })

    const limitedServer = createServer(async (req, res) => {
      await limitedHandler.handle(req, res, { context: {} })
    })

    try {
      await new Promise<void>(resolve => limitedServer.listen(0, '127.0.0.1', resolve))
      const client: RouterClient<typeof router> = createORPCClient(new RPCLink({
        url: '/',
        origin: `http://127.0.0.1:${(limitedServer.address() as AddressInfo).port}`,
      }))

      const content = new Uint8Array(2 * 1024 * 1024).fill(7)
      await expect(client.upload({ file: new File([content], 'too-large.bin') })).rejects.toThrow()

      // Under the limit the same server accepts the upload
      const small = new Uint8Array(16 * 1024).fill(7)
      await expect(client.upload({ file: new File([small], 'small.bin') })).resolves.toMatchObject({ isTmpFile: false, size: small.length })

      await vi.waitFor(() => {
        expect(readdirSync(limitedTmpDir)).toHaveLength(0)
      })
    }
    finally {
      limitedServer.close()
      rmSync(limitedTmpDir, { recursive: true, force: true })
    }
  })

  it('removes tmp files when the client abandons a streaming response', async () => {
    const streamTmpDir = mkdtempSync(path.join(tmpdir(), 'orpc-upload-e2e-stream-abort-'))

    const streamHandler = new RPCHandler({
      stream: os.input(type<File>()).handler(async function* ({ input }) {
        yield await input.text()
        // In-flight logic the abandoned transfer must still wait for before cleanup
        await sleep(1500)
        yield 'never delivered'
      }),
    }, {
      plugins: [new TmpFileUploadHandlerPlugin({ tmpDir: streamTmpDir })],
    })

    const streamServer = createServer(async (req, res) => {
      await streamHandler.handle(req, res, { context: {} })
    })

    try {
      await new Promise<void>(resolve => streamServer.listen(0, '127.0.0.1', resolve))
      const { port } = streamServer.address() as AddressInfo

      const body = Buffer.from('held by the stream')

      await new Promise<void>((resolve, reject) => {
        const socket = connect(port, '127.0.0.1', () => {
          socket.write(`POST /stream HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/octet-stream\r\nContent-Length: ${body.length}\r\n\r\n`)
          socket.write(body)
        })

        // The first event proves the stream is transmitting and the tmp file is still alive
        socket.on('data', (chunk: Buffer) => {
          if (chunk.toString().includes('held by the stream')) {
            socket.destroy()
            resolve()
          }
        })
        socket.on('error', reject)
      })

      await vi.waitFor(() => {
        expect(readdirSync(streamTmpDir)).toHaveLength(0)
      }, { timeout: 5000 })
    }
    finally {
      streamServer.close()
      rmSync(streamTmpDir, { recursive: true, force: true })
    }
  })

  it('completes drip-fed uploads whose bytes arrive in tiny segments', { timeout: 60_000 }, async () => {
    const boundary = 'X-DRIP-BOUNDARY'
    const content = Buffer.alloc(4096, 7)
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="data"\r\n\r\n{"json":{"file":{}},"maps":[[["file"]]]}\r\n--${boundary}\r\nContent-Disposition: form-data; name="0"; filename="drip.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`),
      content,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ])

    for (const segmentSize of [3, 61]) {
      const response = await new Promise<string>((resolve, reject) => {
        const socket = connect((server.address() as AddressInfo).port, '127.0.0.1', () => {
          socket.setNoDelay(true)
          socket.write(`POST /upload HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: multipart/form-data; boundary=${boundary}\r\nContent-Length: ${body.length}\r\nConnection: close\r\n\r\n`)

          void (async () => {
            for (let offset = 0; offset < body.length; offset += segmentSize) {
              socket.write(body.subarray(offset, offset + segmentSize))
              await sleep(0)
            }
          })()
        })

        const chunks: Buffer[] = []
        const timer = setTimeout(() => {
          socket.destroy()
          reject(new Error(`request wedged at segment size ${segmentSize}`))
        }, 30_000)
        socket.on('data', (chunk: Buffer) => chunks.push(chunk))
        socket.on('close', () => {
          clearTimeout(timer)
          resolve(Buffer.concat(chunks).toString())
        })
        socket.on('error', reject)
      })

      expect(response, `segment size ${segmentSize}`).toContain('HTTP/1.1 200')
      expect(response).toContain('"size":4096')
    }

    await vi.waitFor(() => {
      expect(readdirSync(tmpDir)).toHaveLength(0)
    })
  })

  it('removes spooled bytes when the client aborts mid-upload', async () => {
    const controller = new AbortController()

    const body = new ReadableStream<Uint8Array>({
      async pull(streamController) {
        streamController.enqueue(new Uint8Array(64 * 1024).fill(1))
        await sleep(5)
      },
    })

    const responded = fetch(`${url}/upload`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream', 'standard-server': 'file' },
      body,
      duplex: 'half',
      signal: controller.signal,
    })

    // Wait until the server started spooling, so the abort lands mid-upload
    await vi.waitFor(() => {
      expect(existsSync(tmpDir) && readdirSync(tmpDir).length).toBeGreaterThan(0)
    })

    controller.abort()
    await expect(responded).rejects.toThrow()

    await vi.waitFor(() => {
      expect(readdirSync(tmpDir)).toHaveLength(0)
    })
  })
})
