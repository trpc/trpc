import type { Context } from '@orpc/server'
import type { StandardBodyHint, StandardLazyRequest } from '@standard-server/core'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Buffer } from 'node:buffer'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { RPCSerializer } from '@orpc/client'
import { ORPCError, os } from '@orpc/server'
import { RPCHandler } from '@orpc/server/node'
import { generateContentDisposition } from '@standard-server/core'
import request from 'supertest'
import { TmpFile, TmpFileUploadHandlerPlugin } from './tmp-file-upload-handler-plugin'

describe('tmpFileUploadHandlerPlugin', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'orpc-tmp-file-upload-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  interface Captured {
    input: unknown
    /** Whether every `TmpFile` reachable from the input existed while the procedure ran. */
    filesExisted: boolean
    /** The content of each reachable `TmpFile`, read while the procedure ran. */
    fileContents: Buffer[]
    tmpDirEntries: string[]
  }

  function createAgent(options: {
    tmpDir?: string
    memory?: number
    file?: number
    stream?: number
    plugin?: TmpFileUploadHandlerPlugin<Context>
    onInput?: (input: any) => unknown
  } = {}) {
    const captured: Captured[] = []

    const handler = new RPCHandler({
      upload: os.handler(async ({ input }) => {
        const files: TmpFile[] = []
        const visit = (value: unknown): void => {
          if (value instanceof TmpFile) {
            files.push(value)
          }
          else if (value !== null && typeof value === 'object' && !(value instanceof Blob)) {
            Object.values(value).forEach(visit)
          }
        }
        visit(input)

        captured.push({
          input,
          filesExisted: files.every(file => existsSync(file.path)),
          fileContents: await Promise.all(files.map(async file => Buffer.from(await file.arrayBuffer()))),
          tmpDirEntries: readdirSync(tmpDir),
        })

        return options.onInput?.(input) ?? { ok: true }
      }),
    }, {
      plugins: [options.plugin ?? new TmpFileUploadHandlerPlugin({
        tmpDir: options.tmpDir ?? tmpDir,
        maxBodySize: {
          memory: options.memory ?? Number.POSITIVE_INFINITY,
          file: options.file ?? Number.POSITIVE_INFINITY,
          stream: options.stream ?? Number.POSITIVE_INFINITY,
        },
        // Small test bodies still spool
        spoolThreshold: 0,
      })],
    })

    const agent = request(createServer(async (req: IncomingMessage, res: ServerResponse) => {
      const result = await handler.handle(req, res, { context: {} })

      if (!result.matched) {
        res.statusCode = 404
        res.end('not matched')
      }
    }))

    return { agent, captured }
  }

  function toStream(body: Buffer, chunkSize = 16, delivery: 'sync' | 'async' = 'sync'): ReadableStream<Uint8Array> {
    let offset = 0

    return new ReadableStream({
      async pull(controller) {
        if (delivery === 'async') {
          await new Promise<void>(resolve => setImmediate(resolve))
        }

        if (offset >= body.length) {
          controller.close()
          return
        }

        controller.enqueue(body.subarray(offset, offset += chunkSize))
      },
    })
  }

  /**
   * Runs a raw body through the plugin's routing interceptor and hands the
   * resolved result to `inspect` while the request scope is still open,
   * because deferred resources vanish once the interceptor finishes.
   */
  async function runThroughPlugin(options: {
    limits?: { memory?: number, file?: number, stream?: number }
    spoolThreshold?: number
    plugin?: TmpFileUploadHandlerPlugin<Context>
    headers: Record<string, string>
    body?: Buffer
    chunkSize?: number
    delivery?: 'sync' | 'async'
    /** The hint `resolveBody` is called with, mirroring what a codec would pass. */
    hint?: StandardBodyHint
    /** Replaces the raw body stream, for adapters that resolve without one. */
    resolveBody?: StandardLazyRequest['resolveBody']
    inspect: (resolved: unknown) => void | Promise<void>
  }): Promise<void> {
    const plugin = options.plugin ?? new TmpFileUploadHandlerPlugin({
      tmpDir,
      maxBodySize: {
        memory: options.limits?.memory ?? Number.POSITIVE_INFINITY,
        file: options.limits?.file ?? Number.POSITIVE_INFINITY,
        stream: options.limits?.stream ?? Number.POSITIVE_INFINITY,
      },
      // Small test bodies still spool
      spoolThreshold: options.spoolThreshold ?? 0,
    })
    const interceptor = plugin.init({}).routingInterceptors![0]!

    await interceptor({
      context: {},
      prefix: undefined,
      request: {
        method: 'POST',
        url: '/upload',
        headers: options.headers,
        resolveBody: options.resolveBody ?? (async () => toStream(options.body ?? Buffer.alloc(0), options.chunkSize, options.delivery)),
      },
      next: async (nextOptions) => {
        await options.inspect(await nextOptions!.request.resolveBody(options.hint))
        return { matched: false }
      },
    })
  }

  async function expectFileBody(body: Buffer, spooled: boolean, options: Omit<Parameters<typeof runThroughPlugin>[0], 'headers' | 'body' | 'inspect'> = {}): Promise<void> {
    await runThroughPlugin({
      ...options,
      headers: { 'standard-server': 'file' },
      body,
      inspect: async (file) => {
        expect(file instanceof TmpFile).toBe(spooled)
        expect(Buffer.from(await (file as File).arrayBuffer()).equals(body)).toBe(true)
      },
    })
  }

  const boundary = 'X-TEST-BOUNDARY'
  const multipartHeaders = { 'content-type': `multipart/form-data; boundary=${boundary}` }

  /**
   * Serializes parts by hand, so each part's exact cost is known.
   */
  function createMultipartBody(parts: Array<{ header: string, content?: string }>): { body: Buffer, headerSizes: number[], contentSizes: number[] } {
    const headerBlocks = parts.map(part => `${part.header}\r\n\r\n`)
    const contents = parts.map(part => part.content ?? '')

    return {
      body: Buffer.from(`${parts.map((_, i) => `--${boundary}\r\n${headerBlocks[i]}${contents[i]}\r\n`).join('')}--${boundary}--\r\n`),
      headerSizes: headerBlocks.map(block => Buffer.byteLength(block)),
      contentSizes: contents.map(content => Buffer.byteLength(content)),
    }
  }

  function listTmpFiles(): string[] {
    return readdirSync(tmpDir).flatMap(dir => readdirSync(path.join(tmpDir, dir)).map(file => path.join(tmpDir, dir, file)))
  }

  it('spools a file body to a tmp file and removes it when the request finishes', async () => {
    const { agent, captured } = createAgent()
    const content = Buffer.alloc(1024 * 1024 + 3, 7)

    const res = await agent
      .post('/upload')
      .set('content-type', 'application/pdf')
      .set('content-disposition', generateContentDisposition('tệp tin 🚀.pdf', 'attachment'))
      .send(content)

    expect(res.status).toBe(200)

    const file = captured[0]!.input as TmpFile
    expect(file).toBeInstanceOf(TmpFile)
    expect(file.name).toBe('tệp tin 🚀.pdf')
    expect(file.type).toBe('application/pdf')
    expect(file.size).toBe(content.length)
    expect(path.dirname(path.dirname(file.path))).toBe(tmpDir)
    expect(captured[0]!.fileContents[0]!.equals(content)).toBe(true)

    // The tmp file existed while the procedure ran and is gone once the request finished
    expect(captured[0]!.filesExisted).toBe(true)
    expect(captured[0]!.tmpDirEntries).toHaveLength(1)
    expect(readdirSync(tmpDir)).toHaveLength(0)
    expect(existsSync(file.path)).toBe(false)

    // Once the request finished the backing file is gone, so the File can no longer be read
    await expect(file.text()).rejects.toThrow()
  })

  it('defaults the file name when the request carries no content-disposition', async () => {
    const { agent, captured } = createAgent()

    const res = await agent
      .post('/upload')
      .set('content-type', 'application/octet-stream')
      .send(Buffer.from('binary'))

    expect(res.status).toBe(200)

    const file = captured[0]!.input as TmpFile
    expect(file).toBeInstanceOf(TmpFile)
    expect(file.name).toBe('blob')
    expect(captured[0]!.fileContents[0]!.toString()).toBe('binary')
  })

  it('keeps an empty file body requested through the standard-server hint header off disk', async () => {
    const { agent, captured } = createAgent()

    const res = await agent
      .post('/upload')
      .set('content-type', 'application/octet-stream')
      .set('standard-server', 'file')
      .send(Buffer.alloc(0))

    expect(res.status).toBe(200)

    const file = captured[0]!.input as File
    expect(file).toBeInstanceOf(File)
    expect(file).not.toBeInstanceOf(TmpFile)
    expect(file.size).toBe(0)
    expect(captured[0]!.tmpDirEntries).toHaveLength(0)
  })

  it('spools a file body carrying neither content-type nor content-disposition', async () => {
    await runThroughPlugin({
      headers: { 'standard-server': 'file' },
      body: Buffer.from('bare bytes'),
      inspect: async (resolved) => {
        expect(resolved).toBeInstanceOf(TmpFile)
        expect((resolved as TmpFile).name).toBe('blob')
        expect((resolved as TmpFile).type).toBe('')
        expect(await (resolved as TmpFile).text()).toBe('bare bytes')
      },
    })

    expect(readdirSync(tmpDir)).toHaveLength(0)
  })

  it('spools multipart file parts to tmp files and preserves them through deserialization', async () => {
    const { agent, captured } = createAgent()

    const content = Buffer.alloc(64 * 1024).map((_, i) => i % 251)
    const serialized = new RPCSerializer().serialize({
      meta: 'nested 🚀 value',
      file: new File([content], 'dữ liệu 🚀.bin', { type: 'application/octet-stream' }),
    }) as FormData

    const response = new Response(serialized)
    const body = Buffer.from(await response.arrayBuffer())

    const res = await agent
      .post('/upload')
      .set('content-type', response.headers.get('content-type')!)
      .send(body)

    expect(res.status).toBe(200)

    const input = captured[0]!.input as { meta: string, file: TmpFile }
    expect(input.meta).toBe('nested 🚀 value')
    expect(input.file).toBeInstanceOf(TmpFile)
    expect(input.file.name).toBe('dữ liệu 🚀.bin')
    expect(input.file.type).toBe('application/octet-stream')
    expect(input.file.size).toBe(content.length)
    expect(captured[0]!.fileContents[0]!.equals(content)).toBe(true)

    expect(captured[0]!.filesExisted).toBe(true)
    expect(readdirSync(tmpDir)).toHaveLength(0)
  })

  it('keeps tmp files alive while an event stream response reads them', async () => {
    const { agent } = createAgent({
      onInput: (input: TmpFile) => (async function* () {
        yield `first:${await input.text()}`
        yield `second:${await input.text()}`
      })(),
    })

    const res = await agent
      .post('/upload')
      .set('content-type', 'application/octet-stream')
      .send(Buffer.from('streamed upload'))

    expect(res.status).toBe(200)
    // Both yields read the tmp file after the routing interceptor returned
    expect(res.text).toContain('first:streamed upload')
    expect(res.text).toContain('second:streamed upload')

    // Removal rides on the stream finishing, which can settle just after the response does
    await vi.waitFor(() => {
      expect(readdirSync(tmpDir)).toHaveLength(0)
    })
  })

  it('keeps tmp files alive while a stream response echoes them', async () => {
    const content = Buffer.alloc(256 * 1024, 7)
    const { agent } = createAgent({
      onInput: (input: TmpFile) => input.stream(),
    })

    const res = await agent
      .post('/upload')
      .set('content-type', 'application/octet-stream')
      .send(content)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = []
        res.on('data', chunk => chunks.push(chunk))
        res.on('end', () => callback(null, Buffer.concat(chunks)))
      })

    expect(res.status).toBe(200)
    // The response body is the upload itself, read from the tmp file during transmission
    expect((res.body as Buffer).equals(content)).toBe(true)

    await vi.waitFor(() => {
      expect(readdirSync(tmpDir)).toHaveLength(0)
    })
  })

  it('leaves json bodies to the standard parser and creates no tmp files for them', async () => {
    const { agent, captured } = createAgent()

    const res = await agent
      .post('/upload')
      .set('content-type', 'application/json')
      .send({ json: { hello: 'world' } })

    expect(res.status).toBe(200)
    expect(captured[0]!.input).toEqual({ hello: 'world' })
    expect(captured[0]!.tmpDirEntries).toHaveLength(0)
  })

  it('rejects a malformed multipart body and still removes already spooled parts', async () => {
    const { agent, captured } = createAgent()

    const boundary = 'X-TEST-BOUNDARY'
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="0"; filename="a.bin"',
      '',
      'spooled before the malformed tail',
      `--${boundary}`,
      'this-part-has-no-valid-header',
      '',
    ].join('\r\n')

    const res = await agent
      .post('/upload')
      .set('content-type', `multipart/form-data; boundary=${boundary}`)
      .send(Buffer.from(body))

    expect(res.status).toBe(400)
    expect(res.body.json.message).toContain('Malformed request')
    expect(captured).toHaveLength(0)
    expect(readdirSync(tmpDir)).toHaveLength(0)
  })

  it('rejects a multipart body without a boundary parameter', async () => {
    const { agent } = createAgent()

    const res = await agent
      .post('/upload')
      .set('content-type', 'multipart/form-data')
      .send(Buffer.from('irrelevant'))

    expect(res.status).toBe(400)
    expect(readdirSync(tmpDir)).toHaveLength(0)
  })

  it('rejects multipart fields exceeding maxBodySize.memory with PAYLOAD_TOO_LARGE', async () => {
    const { agent, captured } = createAgent({ memory: 10 })

    const boundary = 'X-TEST-BOUNDARY'
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="field"',
      '',
      'x'.repeat(11),
      `--${boundary}--`,
      '',
    ].join('\r\n')

    const res = await agent
      .post('/upload')
      .set('content-type', `multipart/form-data; boundary=${boundary}`)
      .send(Buffer.from(body))

    expect(res.status).toBe(413)
    expect(res.body.json.code).toBe('PAYLOAD_TOO_LARGE')
    expect(captured).toHaveLength(0)
    expect(readdirSync(tmpDir)).toHaveLength(0)
  })

  it('reports filesystem failures as INTERNAL_SERVER_ERROR, not BAD_REQUEST', async () => {
    /**
     * Spooling runs during input decoding, where the handler blames any plain
     * error on the client as a 400, so a disk failure must arrive as an
     * ORPCError to keep its server-fault status.
     */
    const blocked = path.join(tmpDir, 'not-a-directory')
    writeFileSync(blocked, '')
    const { agent, captured } = createAgent({ tmpDir: path.join(blocked, 'unreachable') })

    const res = await agent
      .post('/upload')
      .set('content-type', 'application/octet-stream')
      .send(Buffer.from('x'))

    expect(res.status).toBe(500)
    expect(res.body.json.code).toBe('INTERNAL_SERVER_ERROR')
    expect(captured).toHaveLength(0)
  })

  it('reports failures while appending and sealing as INTERNAL_SERVER_ERROR', async () => {
    const expectInternalError = (error: unknown): boolean => {
      expect(error).toBeInstanceOf(ORPCError)
      expect((error as ORPCError<string, unknown>).code).toBe('INTERNAL_SERVER_ERROR')
      return true
    }

    const tamperAfterSpool = (tamper: (file: string) => void, lastChunk?: Uint8Array) => async () => new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Buffer.from('spooled'))
      },
      async pull(controller) {
        // The stream asks for more before the first chunk has spooled
        tamper(await vi.waitFor(() => {
          const [file] = listTmpFiles()

          if (file === undefined) {
            throw new Error('not spooled yet')
          }

          return file
        }, { interval: 1 }))

        if (lastChunk !== undefined) {
          controller.enqueue(lastChunk)
        }

        controller.close()
      },
    })

    await expect(runThroughPlugin({
      headers: { 'standard-server': 'file' },
      resolveBody: tamperAfterSpool((file) => {
        rmSync(file)
        mkdirSync(file)
      }, Buffer.from('unwritable')),
      inspect: () => {},
    })).rejects.toSatisfy(expectInternalError)

    await expect(runThroughPlugin({
      headers: { 'standard-server': 'file' },
      resolveBody: tamperAfterSpool(file => rmSync(file)),
      inspect: () => {},
    })).rejects.toSatisfy(expectInternalError)

    expect(readdirSync(tmpDir)).toHaveLength(0)
  })

  it('removes tmp files when the procedure throws', async () => {
    const { agent, captured } = createAgent({
      onInput: () => {
        throw new Error('procedure failed')
      },
    })

    const res = await agent
      .post('/upload')
      .set('content-type', 'application/octet-stream')
      .send(Buffer.alloc(1024, 1))

    expect(res.status).toBe(500)
    expect(captured[0]!.filesExisted).toBe(true)
    expect(readdirSync(tmpDir)).toHaveLength(0)
  })

  it('passes through bodies an adapter resolved without a stream', async () => {
    const preParsed = new FormData()
    preParsed.append('already', 'parsed')

    // Multipart, memory-limited, and file paths each keep such bodies untouched
    await runThroughPlugin({
      headers: { 'content-type': 'multipart/form-data; boundary=x' },
      resolveBody: async () => preParsed,
      inspect: resolved => expect(resolved).toBe(preParsed),
    })

    await runThroughPlugin({
      limits: { memory: 1024 },
      headers: { 'content-type': 'application/json' },
      resolveBody: async () => preParsed,
      inspect: resolved => expect(resolved).toBe(preParsed),
    })

    await runThroughPlugin({
      headers: { 'standard-server': 'file' },
      resolveBody: async () => preParsed,
      inspect: resolved => expect(resolved).toBe(preParsed),
    })

    expect(readdirSync(tmpDir)).toHaveLength(0)
  })

  it('constructs without options and delegates bodiless requests untouched', async () => {
    const plugin = new TmpFileUploadHandlerPlugin()
    const interceptor = plugin.init({}).routingInterceptors![0]!
    const resolved = Symbol('resolved')

    const result = await interceptor({
      context: {},
      prefix: undefined,
      request: {
        method: 'POST',
        url: '/upload',
        headers: {},
        resolveBody: async () => resolved as never,
      },
      next: async (nextOptions) => {
        // A bodiless request resolves to the none hint and stays with the adapter
        expect(await nextOptions!.request.resolveBody()).toBe(resolved)
        return { matched: false }
      },
    })

    expect(result).toEqual({ matched: false })
  })

  describe('multipart parsing parity with the standard parser', () => {
    type MaterializedEntry
      = | { kind: 'field', name: string, value: string }
        | { kind: 'file', name: string, fileName: string, type: string, content: Buffer, isTmpFile: boolean }

    /**
     * Materializes the parsed entries while the request scope is still open,
     * because the backing tmp files vanish once the interceptor finishes.
     */
    async function parseThroughPlugin(body: Buffer, contentType: string, options: { chunkSize?: number, memory?: number, delivery?: 'sync' | 'async' } = {}): Promise<MaterializedEntry[]> {
      let entries: MaterializedEntry[]

      await runThroughPlugin({
        limits: { memory: options.memory },
        headers: { 'content-type': contentType },
        body,
        chunkSize: options.chunkSize,
        delivery: options.delivery,
        inspect: async (form) => {
          entries = await Promise.all([...form as FormData].map(async ([name, value]) => typeof value === 'string'
            ? { kind: 'field' as const, name, value }
            : {
                kind: 'file' as const,
                name,
                fileName: value.name,
                type: value.type,
                content: Buffer.from(await value.arrayBuffer()),
                isTmpFile: value instanceof TmpFile,
              }))
        },
      })

      return entries!
    }

    async function expectMatchesStandardParser(form: FormData, chunkSizes: number[], delivery?: 'sync' | 'async'): Promise<void> {
      const response = new Response(form)
      const contentType = response.headers.get('content-type')!
      const body = Buffer.from(await response.arrayBuffer())

      const expectedEntries = [...await new Response(body, { headers: { 'content-type': contentType } }).formData()]

      for (const chunkSize of chunkSizes) {
        const entries = await parseThroughPlugin(body, contentType, { chunkSize, delivery })

        expect(entries).toHaveLength(expectedEntries.length)

        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i]!
          const [expectedName, expectedValue] = expectedEntries[i]!

          expect(entry.name).toBe(expectedName)

          if (typeof expectedValue === 'string') {
            expect(entry).toMatchObject({ kind: 'field', value: expectedValue })
          }
          else {
            expect(entry).toMatchObject({ kind: 'file', fileName: expectedValue.name, type: expectedValue.type, isTmpFile: expectedValue.size > 0 })
            expect((entry as { content: Buffer }).content.equals(Buffer.from(await expectedValue.arrayBuffer()))).toBe(true)
          }
        }
      }
    }

    it('parses what the standard parser parses, preserving entry order', async () => {
      const form = new FormData()
      form.append('field', 'value')
      form.append('unicode', 'tiếng Việt 🚀')
      form.append('mixed', 'before the file')
      form.append('mixed', new File(['file content'], 'tệp tin 🚀.txt', { type: 'text/plain' }))
      form.append('mixed', 'after the file')
      form.append('binary', new File([new Uint8Array([0, 1, 2, 253, 254, 255])], 'raw.bin', { type: 'application/octet-stream' }))
      form.append('empty', new File([], 'empty.bin'))
      // Escaped by the serializer as %22, %0D, and %0A, and decoded back by parsers
      form.append('quo"ted\nname', 'value')
      form.append('escapes', new File(['x'], 'my "quoted"\r\nfile.txt', { type: 'text/plain' }))
      // Path segments stay in filenames, as browser directory uploads rely on
      form.append('paths', new File(['y'], 'photos/2024/img.png', { type: 'image/png' }))
      form.append('paths', new File(['z'], 'C:\\tmp\\a.png', { type: 'image/png' }))

      await expectMatchesStandardParser(form, [1, 2, 3, 7, 64, 1024, 1024 * 1024])
      await expectMatchesStandardParser(form, [1, 3, 61], 'async')
    })

    it('parses an empty form and a drip-fed body whose epilogue arrives in its own chunks', async () => {
      // An empty form is nothing but the close delimiter, allowed without a preceding line break
      await expectMatchesStandardParser(new FormData(), [1, 2, 1024])
      await expectMatchesStandardParser(new FormData(), [1], 'async')

      /**
       * The trailing CRLF after the close delimiter lands in separate slowly
       * delivered chunks. Event-driven parsers can wedge permanently on bytes
       * arriving after their close delimiter, so the epilogue handling is pinned
       * against exactly this delivery pattern.
       */
      const form = new FormData()
      form.append('field', 'value')
      form.append('file', new File([new Uint8Array(4096).fill(7)], 'a.bin', { type: 'application/octet-stream' }))

      await expectMatchesStandardParser(form, [1, 2, 3], 'async')
    })

    it('parses randomized forms identically at randomized chunk sizes', async () => {
      // Deterministic PRNG so a failure reproduces
      let seed = 0x2F6E2B1
      const random = (): number => {
        seed = (seed * 1664525 + 1013904223) % 4294967296
        return seed / 4294967296
      }

      const fragments = ['\r', '\n', '\r\n', '--', '\r\n--', 'formdata-', 'a', '"', ';', 'é', '🚀', '\0', '\r\n--formdata']

      for (let iteration = 0; iteration < 10; iteration++) {
        const form = new FormData()
        const partCount = 1 + Math.floor(random() * 6)

        for (let i = 0; i < partCount; i++) {
          let content = ''
          const fragmentCount = Math.floor(random() * 200)
          for (let j = 0; j < fragmentCount; j++) {
            content += fragments[Math.floor(random() * fragments.length)]
          }

          if (random() < 0.5) {
            form.append(`field-${i}`, content)
          }
          else {
            form.append(`file-${i}`, new File([content], `file-${i}.bin`, { type: random() < 0.5 ? 'application/octet-stream' : '' }))
          }
        }

        const chunkSize = [1, 2, 3, 5, 8, 64, 997, 8192][Math.floor(random() * 8)]!
        await expectMatchesStandardParser(form, [chunkSize], iteration % 2 === 0 ? 'async' : 'sync')
      }
    })

    it('treats an octet-stream part without a filename as a plain field', async () => {
      const boundary = 'X-TEST-BOUNDARY'
      const body = Buffer.from([
        `--${boundary}`,
        'Content-Disposition: form-data; name="octet"',
        'Content-Type: application/octet-stream',
        '',
        'still a field',
        `--${boundary}--`,
        '',
      ].join('\r\n'))

      const entries = await parseThroughPlugin(body, `multipart/form-data; boundary=${boundary}`)
      expect(entries).toEqual([{ kind: 'field', name: 'octet', value: 'still a field' }])

      // The field limit applies to it like any other field
      await expect(parseThroughPlugin(body, `multipart/form-data; boundary=${boundary}`, { memory: 5 }))
        .rejects
        .toSatisfy(error => error instanceof ORPCError && error.code === 'PAYLOAD_TOO_LARGE')

      expect(readdirSync(tmpDir)).toHaveLength(0)
    })

    it('keeps semicolons and backslashes in quoted content-disposition parameters', async () => {
      const boundary = 'X-TEST-BOUNDARY'
      const body = Buffer.from([
        `--${boundary}`,
        'Content-Disposition: form-data; name="quoted"; filename="fi;\\le .txt"',
        '',
        'v',
        `--${boundary}--`,
        '',
      ].join('\r\n'))

      const contentType = `multipart/form-data; boundary=${boundary}`
      const expected = await new Response(body, { headers: { 'content-type': contentType } }).formData()

      const entries = await parseThroughPlugin(body, contentType)
      expect(entries).toMatchObject([{ kind: 'file', name: 'quoted', fileName: (expected.get('quoted') as File).name }])
      expect(entries[0]).toMatchObject({ fileName: 'fi;\\le .txt' })
    })

    it('parses a quoted boundary parameter, drip-fed through the epilogue', async () => {
      const body = Buffer.from([
        '--quoted boundary',
        'Content-Disposition: form-data; name="field"',
        '',
        'value',
        '--quoted boundary--',
        '',
      ].join('\r\n'))

      // The boundary parameter may be quoted, with characters a bare token forbids
      const entries = await parseThroughPlugin(body, 'multipart/form-data; boundary="quoted boundary"', { chunkSize: 2, delivery: 'async' })
      expect(entries).toEqual([{ kind: 'field', name: 'field', value: 'value' }])
    })

    it('rejects a part whose content-disposition has no name parameter, like the standard parser', async () => {
      const boundary = 'X-TEST-BOUNDARY'
      const body = Buffer.from([
        `--${boundary}`,
        'Content-Disposition: form-data; filename="a.txt"',
        '',
        'v',
        `--${boundary}--`,
        '',
      ].join('\r\n'))

      const contentType = `multipart/form-data; boundary=${boundary}`
      await expect(new Response(body, { headers: { 'content-type': contentType } }).formData()).rejects.toThrow()
      await expect(parseThroughPlugin(body, contentType)).rejects.toThrow('name parameter')
      expect(readdirSync(tmpDir)).toHaveLength(0)

      const { agent, captured } = createAgent()
      const res = await agent.post('/upload').set('content-type', contentType).send(body)
      expect(res.status).toBe(400)
      expect(captured).toHaveLength(0)
    })

    it('rejects parts without a form-data content-disposition, like the standard parser', async () => {
      const boundary = 'X-TEST-BOUNDARY'
      const contentType = `multipart/form-data; boundary=${boundary}`

      const withoutDisposition = Buffer.from([
        `--${boundary}`,
        'Content-Type: text/plain',
        '',
        'no disposition at all',
        `--${boundary}--`,
        '',
      ].join('\r\n'))

      const wrongDisposition = Buffer.from([
        `--${boundary}`,
        'Content-Disposition: attachment; name="x"',
        '',
        'wrong disposition',
        `--${boundary}--`,
        '',
      ].join('\r\n'))

      for (const body of [withoutDisposition, wrongDisposition]) {
        await expect(new Response(body, { headers: { 'content-type': contentType } }).formData()).rejects.toThrow()
        await expect(parseThroughPlugin(body, contentType)).rejects.toThrow(TypeError)
      }

      expect(readdirSync(tmpDir)).toHaveLength(0)
    })

    it('decodes field values as UTF-8 regardless of the part charset, like the standard parser', async () => {
      const boundary = 'X-TEST-BOUNDARY'
      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="field"\r\nContent-Type: text/plain; charset=latin1\r\n\r\n`),
        // 0xE9 is é in latin1 and an invalid sequence in UTF-8
        Buffer.from([0xE9]),
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ])

      const contentType = `multipart/form-data; boundary=${boundary}`
      const expected = await new Response(body, { headers: { 'content-type': contentType } }).formData()

      const entries = await parseThroughPlugin(body, contentType)
      expect(entries).toEqual([{ kind: 'field', name: 'field', value: expected.get('field') }])
      expect(entries[0]).toMatchObject({ value: '�' })
    })

    it('keeps content-type parameters in file types, like the standard parser', async () => {
      const boundary = 'X-TEST-BOUNDARY'
      const body = Buffer.from([
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="data.csv"',
        'Content-Type: text/csv; charset=utf-8',
        '',
        'a,b',
        `--${boundary}--`,
        '',
      ].join('\r\n'))

      const contentType = `multipart/form-data; boundary=${boundary}`
      const expected = await new Response(body, { headers: { 'content-type': contentType } }).formData()

      const entries = await parseThroughPlugin(body, contentType)
      expect(entries).toMatchObject([{ kind: 'file', fileName: 'data.csv', type: (expected.get('file') as File).type }])
      expect(entries[0]).toMatchObject({ type: 'text/csv; charset=utf-8' })
    })

    it('rejects a form-data hinted body that is not multipart during parsing', async () => {
      await expect(runThroughPlugin({
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'content-length': '9' },
        body: Buffer.from('key=value'),
        chunkSize: 4,
        hint: 'form-data',
        inspect: () => {},
      })).rejects.toThrow('boundary')

      await expect(runThroughPlugin({
        headers: {},
        hint: 'form-data',
        inspect: () => {},
      })).rejects.toThrow('boundary')

      expect(readdirSync(tmpDir)).toHaveLength(0)
    })

    it('spools many small file parts without accumulating open file handles', async () => {
      // Only observable through the process fd table
      if (!existsSync('/proc/self/fd')) {
        return
      }

      const form = new FormData()
      for (let i = 0; i < 300; i++) {
        form.append(`file-${i}`, new File([`content-${i}`], `f-${i}.bin`, { type: 'application/octet-stream' }))
      }

      const response = new Response(form)
      const contentType = response.headers.get('content-type')!
      const body = Buffer.from(await response.arrayBuffer())

      const baseline = readdirSync('/proc/self/fd').length
      let maxFds = baseline

      const sampler = setInterval(() => {
        maxFds = Math.max(maxFds, readdirSync('/proc/self/fd').length)
      }, 1)

      try {
        // Contents stay unread: lazy reads would open descriptors of their own
        await runThroughPlugin({
          headers: { 'content-type': contentType },
          body,
          chunkSize: 256,
          delivery: 'async',
          inspect: parsed => expect([...parsed as FormData]).toHaveLength(300),
        })
      }
      finally {
        clearInterval(sampler)
      }

      // Disk work is serialized, so concurrent handles stay flat instead of one per part
      expect(maxFds - baseline).toBeLessThan(30)
    })
  })

  describe('kind-aware size limits', () => {
    function expectPayloadTooLarge(error: unknown): boolean {
      expect(error).toBeInstanceOf(ORPCError)
      expect((error as ORPCError<string, unknown>).code).toBe('PAYLOAD_TOO_LARGE')
      return true
    }

    const eventStreamHeaders = { 'content-type': 'text/event-stream' }
    const octetStreamHeaders = { 'content-type': 'application/octet-stream', 'standard-server': 'octet-stream' }

    function sum(values: number[]): number {
      return values.reduce((total, value) => total + value, 0)
    }

    /**
     * Reads a streamed body to its end.
     */
    async function collect<T>(body: unknown): Promise<T[]> {
      const items: T[] = []
      for await (const item of body as AsyncIterable<T>) {
        items.push(item)
      }
      return items
    }

    /**
     * Counts the tmp files a rejected request created, before cleanup removes them.
     */
    async function countTmpFilesWhenRejected(limits: { memory?: number, file?: number }, body: Buffer): Promise<number> {
      const plugin = new TmpFileUploadHandlerPlugin({
        tmpDir,
        maxBodySize: {
          memory: limits.memory ?? Number.POSITIVE_INFINITY,
          file: limits.file ?? Number.POSITIVE_INFINITY,
          stream: Number.POSITIVE_INFINITY,
        },
        spoolThreshold: 0,
      })
      let count: number | undefined

      await plugin.init({}).routingInterceptors![0]!({
        context: {},
        prefix: undefined,
        request: {
          method: 'POST',
          url: '/upload',
          headers: multipartHeaders,
          resolveBody: async () => toStream(body),
        },
        next: async (nextOptions) => {
          await expect(nextOptions!.request.resolveBody()).rejects.toSatisfy(expectPayloadTooLarge)
          count = listTmpFiles().length

          return { matched: false }
        },
      })

      expect(readdirSync(tmpDir)).toHaveLength(0)

      return count!
    }

    it('limits json bodies against maxBodySize.memory', async () => {
      // The declared length rejects before any byte is read
      const { agent, captured } = createAgent({ memory: 10 })
      const res = await agent
        .post('/upload')
        .set('content-type', 'application/json')
        .send({ json: { padding: 'x'.repeat(64) } })

      expect(res.status).toBe(413)
      expect(res.body.json.code).toBe('PAYLOAD_TOO_LARGE')
      expect(captured).toHaveLength(0)

      // Without a declared length the limit trips while streaming
      await expect(runThroughPlugin({
        limits: { memory: 10 },
        headers: { 'content-type': 'application/json' },
        body: Buffer.from(JSON.stringify({ padding: 'x'.repeat(64) })),
        inspect: () => {},
      })).rejects.toSatisfy(expectPayloadTooLarge)

      // Under the limit the body parses normally
      await runThroughPlugin({
        limits: { memory: 1024 },
        headers: { 'content-type': 'application/json' },
        body: Buffer.from(JSON.stringify({ hello: 'world' })),
        inspect: (body) => {
          expect(body).toEqual({ hello: 'world' })
        },
      })
    })

    it('limits url-encoded bodies against maxBodySize.memory', async () => {
      await expect(runThroughPlugin({
        limits: { memory: 10 },
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: Buffer.from(`key=${'v'.repeat(64)}`),
        inspect: () => {},
      })).rejects.toSatisfy(expectPayloadTooLarge)

      await runThroughPlugin({
        limits: { memory: 1024 },
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: Buffer.from('key=value'),
        inspect: (body) => {
          expect(body).toBeInstanceOf(URLSearchParams)
          expect((body as URLSearchParams).get('key')).toBe('value')
        },
      })
    })

    it('limits file bodies against maxBodySize.file', async () => {
      // The declared length rejects before anything touches the disk
      const { agent, captured } = createAgent({ file: 1024 })
      const res = await agent
        .post('/upload')
        .set('content-type', 'application/octet-stream')
        .send(Buffer.alloc(4096, 7))

      expect(res.status).toBe(413)
      expect(res.body.json.code).toBe('PAYLOAD_TOO_LARGE')
      expect(captured).toHaveLength(0)
      expect(readdirSync(tmpDir)).toHaveLength(0)

      // Without a declared length the limit trips mid-spool and the partial file is removed
      await expect(runThroughPlugin({
        limits: { file: 64 },
        headers: { 'content-type': 'application/octet-stream', 'standard-server': 'file' },
        body: Buffer.alloc(4096, 7),
        inspect: () => {},
      })).rejects.toSatisfy(expectPayloadTooLarge)

      expect(readdirSync(tmpDir)).toHaveLength(0)
    })

    it('limits multipart fields and files against their own categories', async () => {
      const { body, headerSizes, contentSizes } = createMultipartBody([
        { header: 'Content-Disposition: form-data; name="first"', content: 'x'.repeat(6) },
        { header: 'Content-Disposition: form-data; name="upload-1"; filename="a.bin"', content: 'z'.repeat(6) },
        { header: 'Content-Disposition: form-data; name="second"', content: 'y'.repeat(6) },
        { header: 'Content-Disposition: form-data; name="upload-2"; filename="b.bin"', content: 'w'.repeat(6) },
      ])
      const memoryCost = sum(headerSizes) + contentSizes[0]! + contentSizes[2]!
      const fileCost = contentSizes[1]! + contentSizes[3]!

      for (const limits of [{ memory: memoryCost }, { file: fileCost }]) {
        await runThroughPlugin({
          limits,
          headers: multipartHeaders,
          body,
          inspect: (parsed) => {
            expect([...(parsed as FormData)]).toHaveLength(4)
          },
        })
      }

      for (const limits of [{ memory: memoryCost - 1 }, { file: fileCost - 1 }]) {
        await expect(runThroughPlugin({
          limits,
          headers: multipartHeaders,
          body,
          inspect: () => {},
        })).rejects.toSatisfy(expectPayloadTooLarge)
      }

      expect(readdirSync(tmpDir)).toHaveLength(0)
    })

    it('charges file part headers against maxBodySize.memory, and keeps empty file parts off disk', async () => {
      // The smallest possible file part
      const { body, headerSizes } = createMultipartBody(Array.from({ length: 64 }, () => ({
        header: 'Content-Disposition: form-data; name=""; filename=""',
      })))
      const headerCost = sum(headerSizes)

      await runThroughPlugin({
        limits: { memory: headerCost },
        headers: multipartHeaders,
        body,
        inspect: (parsed) => {
          const entries = [...(parsed as FormData)]

          expect(entries).toHaveLength(64)
          expect(entries.every(([, value]) => value instanceof File && !(value instanceof TmpFile) && value.size === 0)).toBe(true)
        },
      })

      expect(await countTmpFilesWhenRejected({ memory: headerCost - 1 }, body)).toBe(0)
    })

    it('holds small uploads against maxBodySize.memory, spooling those that no longer fit', async () => {
      const { body, headerSizes } = createMultipartBody([
        { header: 'Content-Disposition: form-data; name="first"; filename="a.bin"', content: 'a'.repeat(100) },
        { header: 'Content-Disposition: form-data; name="second"; filename="b.bin"', content: 'b'.repeat(100) },
        { header: 'Content-Disposition: form-data; name="field"', content: 'f'.repeat(40) },
      ])

      await runThroughPlugin({
        limits: { memory: sum(headerSizes) + 100 + 40 },
        spoolThreshold: 1024,
        headers: multipartHeaders,
        body,
        inspect: async (parsed) => {
          const form = parsed as FormData

          expect(form.get('first')).not.toBeInstanceOf(TmpFile)
          expect(form.get('second')).toBeInstanceOf(TmpFile)
          expect(await (form.get('second') as File).text()).toBe('b'.repeat(100))
          // Spooling refunded the second file's memory
          expect(form.get('field')).toBe('f'.repeat(40))
        },
      })

      await expectFileBody(Buffer.alloc(100, 7), false, { limits: { memory: 100 }, spoolThreshold: 1024 })
      await expectFileBody(Buffer.alloc(100, 7), true, { limits: { memory: 99 }, spoolThreshold: 1024 })

      expect(readdirSync(tmpDir)).toHaveLength(0)
    })

    it('charges uploads against maxBodySize.file even while they stay in memory', async () => {
      const { body } = createMultipartBody([
        { header: 'Content-Disposition: form-data; name="upload"; filename="a.bin"', content: 'z'.repeat(100) },
      ])

      await expect(runThroughPlugin({
        limits: { file: 99 },
        spoolThreshold: 1024,
        headers: multipartHeaders,
        body,
        inspect: () => {},
      })).rejects.toSatisfy(expectPayloadTooLarge)

      await expect(runThroughPlugin({
        limits: { file: 99 },
        spoolThreshold: 1024,
        headers: { 'standard-server': 'file' },
        body: Buffer.alloc(100, 7),
        inspect: () => {},
      })).rejects.toSatisfy(expectPayloadTooLarge)

      expect(readdirSync(tmpDir)).toHaveLength(0)
    })

    it('charges field parts their headers, so long names consume maxBodySize.memory', async () => {
      const name = 'n'.repeat(4096)
      const { body, headerSizes } = createMultipartBody([
        { header: `Content-Disposition: form-data; name="${name}"` },
        { header: `Content-Disposition: form-data; name="${name}"` },
      ])
      const memoryCost = sum(headerSizes)

      await runThroughPlugin({
        limits: { memory: memoryCost },
        headers: multipartHeaders,
        body,
        inspect: (parsed) => {
          expect([...(parsed as FormData)]).toEqual([[name, ''], [name, '']])
        },
      })

      await expect(runThroughPlugin({
        limits: { memory: memoryCost - 1 },
        headers: multipartHeaders,
        body,
        inspect: () => {},
      })).rejects.toSatisfy(expectPayloadTooLarge)
    })

    it('limits the whole multipart body to the sum of the memory and file limits', async () => {
      const content = 'y'.repeat(1024)
      const { body: parts, headerSizes, contentSizes } = createMultipartBody([
        { header: 'Content-Disposition: form-data; name="a"', content: 'x' },
        { header: 'Content-Disposition: form-data; name="b"; filename="a.bin"', content },
      ])
      // An uncharged preamble
      const body = Buffer.concat([Buffer.from(`${'p'.repeat(510)}\r\n`), parts])

      const memory = sum(headerSizes) + contentSizes[0]!
      const file = contentSizes[1]!

      // Crosses the sum partway through the file part
      expect(await countTmpFilesWhenRejected({ memory, file }, body)).toBe(1)

      // One infinite category lifts the total bound
      await runThroughPlugin({
        limits: { memory },
        headers: multipartHeaders,
        body,
        inspect: async (parsed) => {
          const entries = [...(parsed as FormData)]

          expect(entries).toHaveLength(2)
          expect(await (entries[1]![1] as File).text()).toBe(content)
        },
      })
    })

    it('limits streamed bodies against maxBodySize.stream while they are consumed', async () => {
      // A raw stream fails at the reader once the limit is crossed
      await runThroughPlugin({
        limits: { stream: 64 },
        headers: octetStreamHeaders,
        body: Buffer.alloc(4096, 7),
        inspect: async (body) => {
          await expect(collect(body)).rejects.toSatisfy(expectPayloadTooLarge)
        },
      })

      // Under the limit the bytes pass through unchanged, never charged to memory
      const content = Buffer.alloc(64, 7)
      await runThroughPlugin({
        limits: { memory: 1, stream: 1024 },
        headers: octetStreamHeaders,
        body: content,
        inspect: async (body) => {
          expect(Buffer.concat(await collect<Uint8Array>(body)).equals(content)).toBe(true)
        },
      })
    })

    it('limits event streams against maxBodySize.stream while they are consumed', async () => {
      const events = Buffer.from('event: message\ndata: "one"\n\nevent: message\ndata: "two"\n\nevent: close\n\n')

      await runThroughPlugin({
        limits: { stream: 1024 },
        headers: eventStreamHeaders,
        body: events,
        inspect: async (body) => {
          expect(await collect(body)).toEqual(['one', 'two'])
        },
      })

      await runThroughPlugin({
        limits: { stream: 8 },
        headers: eventStreamHeaders,
        body: events,
        inspect: async (body) => {
          await expect(collect(body)).rejects.toSatisfy(expectPayloadTooLarge)
        },
      })
    })

    it('limits each event of an event stream against maxBodySize.memory, up to its blank line in every line ending style', async () => {
      const events = [
        'id: 1\ndata: "lf"\n\n',
        'id: 2\r\ndata: "crlf"\r\n\r',
        'id: 3\rdata: "cr"\r\r',
        'id: 4\ndata: "mixed"\n\r',
      ]

      for (const event of events) {
        // Two events exceed the limit only in total, and line endings around them cost nothing
        const body = Buffer.from(`\r\n\n${event}${event}\n`)
        const size = Buffer.byteLength(event)

        // One byte per chunk spreads each event over many chunks
        for (const chunkSize of [1, body.length]) {
          await runThroughPlugin({
            limits: { memory: size },
            headers: eventStreamHeaders,
            body,
            chunkSize,
            inspect: async (body) => {
              expect(await collect(body)).toHaveLength(2)
            },
          })

          await runThroughPlugin({
            limits: { memory: size - 1 },
            headers: eventStreamHeaders,
            body,
            chunkSize,
            inspect: async (body) => {
              await expect(collect(body)).rejects.toSatisfy(expectPayloadTooLarge)
            },
          })
        }
      }
    })

    it('rejects an event that never ends, however fast it is read, even with an unlimited stream', async () => {
      // A single CR, LF, or CRLF ends a line, never the event
      await runThroughPlugin({
        limits: { memory: 1024 },
        headers: eventStreamHeaders,
        body: Buffer.from('data: a\ndata: b\r\ndata: c\r'.repeat(1024)),
        inspect: async (body) => {
          await expect(collect(body)).rejects.toSatisfy(expectPayloadTooLarge)
        },
      })
    })

    it('spools a file body identified only by its content-disposition, per the 0.8 resolution order', async () => {
      // No content-length and no standard-server header, only a content-disposition
      await runThroughPlugin({
        headers: { 'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="doc.pdf"' },
        body: Buffer.from('pdf bytes'),
        inspect: async (body) => {
          expect(body).toBeInstanceOf(TmpFile)
          expect((body as TmpFile).name).toBe('doc.pdf')
          expect(await (body as TmpFile).text()).toBe('pdf bytes')
        },
      })
    })

    it('recognizes multipart content types case-insensitively, per the 0.8 resolution order', async () => {
      const form = new FormData()
      form.append('field', 'value')

      const response = new Response(form)
      const contentType = response.headers.get('content-type')!
      const body = Buffer.from(await response.arrayBuffer())

      await runThroughPlugin({
        headers: { 'content-type': contentType.replace('multipart/form-data', 'Multipart/Form-Data') },
        body,
        inspect: (parsed) => {
          expect(parsed).toBeInstanceOf(FormData)
          expect((parsed as FormData).get('field')).toBe('value')
        },
      })
    })
  })

  describe('per-request size limits', () => {
    interface AuthContext { user?: string }

    /**
     * Runs a request through a plugin whose limits follow the request context:
     * 16 bytes of every kind for a guest, 4096 for an authenticated user.
     */
    async function runWithContextualLimits(options: {
      context: AuthContext
      headers?: Record<string, string>
      body?: Buffer
      /** How many times the routed request resolves its body. */
      resolutions?: number
      /** Runs while the request scope is still open, before tmp files are removed. */
      inspect?: (resolved: unknown[]) => void | Promise<void>
    }): Promise<{ resolverCalls: Array<{ context: AuthContext, url: string }>, resolved: unknown[] }> {
      const resolverCalls: Array<{ context: AuthContext, url: string }> = []

      const plugin = new TmpFileUploadHandlerPlugin<AuthContext>({
        tmpDir,
        maxBodySize: async ({ context, request }) => {
          resolverCalls.push({ context, url: request.url })

          const limit = context.user === undefined ? 16 : 4096

          return { memory: limit, file: limit, stream: limit }
        },
        spoolThreshold: 0,
      })

      const interceptor = plugin.init({}).routingInterceptors![0]!
      const resolved: unknown[] = []

      await interceptor({
        context: options.context,
        prefix: undefined,
        request: {
          method: 'POST',
          url: '/upload',
          headers: options.headers ?? { 'content-type': 'application/json' },
          resolveBody: async () => toStream(options.body ?? Buffer.alloc(0)),
        },
        next: async (nextOptions) => {
          for (let i = 0; i < (options.resolutions ?? 1); i++) {
            resolved.push(await nextOptions!.request.resolveBody())
          }

          await options.inspect?.(resolved)

          return { matched: false }
        },
      })

      return { resolverCalls, resolved }
    }

    it('limits memory-parsed bodies by what the resolver returns for the request', async () => {
      const body = Buffer.from(JSON.stringify({ padding: 'x'.repeat(64) }))

      const authed = await runWithContextualLimits({ context: { user: 'admin' }, body })

      expect(authed.resolved).toEqual([{ padding: 'x'.repeat(64) }])
      expect(authed.resolverCalls).toEqual([{ context: { user: 'admin' }, url: '/upload' }])

      await expect(runWithContextualLimits({ context: {}, body })).rejects.toSatisfy((error) => {
        expect(error).toBeInstanceOf(ORPCError)
        expect((error as ORPCError<string, unknown>).code).toBe('PAYLOAD_TOO_LARGE')
        return true
      })
    })

    it('limits spooled files by what the resolver returns for the request', async () => {
      const headers = { 'content-type': 'application/octet-stream', 'standard-server': 'file' }
      const body = Buffer.alloc(64, 7)

      await runWithContextualLimits({
        context: { user: 'admin' },
        headers,
        body,
        inspect: async ([resolvedBody]) => {
          expect(resolvedBody).toBeInstanceOf(TmpFile)
          expect(Buffer.from(await (resolvedBody as TmpFile).arrayBuffer()).equals(body)).toBe(true)
        },
      })

      await expect(runWithContextualLimits({ context: {}, headers, body })).rejects.toSatisfy((error) => {
        expect(error).toBeInstanceOf(ORPCError)
        expect((error as ORPCError<string, unknown>).code).toBe('PAYLOAD_TOO_LARGE')
        return true
      })

      expect(readdirSync(tmpDir)).toHaveLength(0)
    })

    it('skips the resolver when no body is parsed', async () => {
      // The routed request never resolves its body
      const untouched = await runWithContextualLimits({ context: { user: 'admin' }, resolutions: 0 })

      expect(untouched.resolverCalls).toHaveLength(0)

      // A request whose headers describe no body is left to the standard parser
      const bodyless = await runWithContextualLimits({ context: { user: 'admin' }, headers: {} })

      expect(bodyless.resolverCalls).toHaveLength(0)
      expect(bodyless.resolved[0]).toBeInstanceOf(ReadableStream)
    })
  })

  describe('spool threshold', () => {
    it('creates no tmp files for a flood of empty file parts before the procedure runs', async () => {
      const { agent, captured } = createAgent({
        plugin: new TmpFileUploadHandlerPlugin({
          tmpDir,
          // The limits the documentation recommends
          maxBodySize: { memory: 1024 * 1024, file: 500 * 1024 * 1024, stream: 500 * 1024 * 1024 },
        }),
        onInput: () => {
          throw new ORPCError('UNAUTHORIZED')
        },
      })

      const { body } = createMultipartBody(Array.from({ length: 5000 }, () => ({
        header: 'Content-Disposition: form-data; name="a"; filename=""',
      })))

      const res = await agent.post('/upload').set(multipartHeaders).send(body)

      expect(res.status).toBe(401)
      expect(captured[0]!.tmpDirEntries).toHaveLength(0)
    })

    it('keeps uploads up to the threshold in memory and spools larger ones whole, at any chunk size', async () => {
      const atThreshold = Buffer.alloc(1024, 'at the threshold')
      const overThreshold = Buffer.alloc(1025, 'over the threshold')

      const form = new FormData()
      form.append('at', new File([atThreshold], 'at.bin'))
      form.append('over', new File([overThreshold], 'over.bin'))

      const response = new Response(form)
      const headers = { 'content-type': response.headers.get('content-type')! }
      const body = Buffer.from(await response.arrayBuffer())

      for (const chunkSize of [1, 7, 1000, 4096]) {
        await runThroughPlugin({
          spoolThreshold: 1024,
          headers,
          body,
          chunkSize,
          inspect: async (parsed) => {
            const at = (parsed as FormData).get('at') as File
            const over = (parsed as FormData).get('over') as File

            expect(at).not.toBeInstanceOf(TmpFile)
            expect(over).toBeInstanceOf(TmpFile)
            expect(Buffer.from(await at.arrayBuffer()).equals(atThreshold)).toBe(true)
            expect(Buffer.from(await over.arrayBuffer()).equals(overThreshold)).toBe(true)
            expect(listTmpFiles()).toHaveLength(1)
          },
        })
      }

      await expectFileBody(atThreshold, false, { spoolThreshold: 1024, chunkSize: 7 })
      await expectFileBody(overThreshold, true, { spoolThreshold: 1024, chunkSize: 7 })

      expect(readdirSync(tmpDir)).toHaveLength(0)
    })

    it('defaults the threshold to 64 KiB', async () => {
      const plugin = new TmpFileUploadHandlerPlugin({ tmpDir })

      await expectFileBody(Buffer.alloc(64 * 1024, 7), false, { plugin, chunkSize: 16 * 1024 })
      await expectFileBody(Buffer.alloc(64 * 1024 + 1, 7), true, { plugin, chunkSize: 16 * 1024 })
    })
  })
})
