import type { Context } from '@orpc/server'
import type { StandardHandlerOptions, StandardHandlerPlugin, StandardHandlerRoutingInterceptor, StandardHandlerRoutingInterceptorOptions } from '@orpc/server/standard'
import type { Promisable, Value } from '@orpc/shared'
import type { StandardBody, StandardBodyHint, StandardHeaders, StandardLazyRequest } from '@standard-server/core'
import type { FilePropertyBag } from 'node:buffer'
import { Buffer } from 'node:buffer'
import { openAsBlob } from 'node:fs'
import { appendFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { ORPCError } from '@orpc/server'
import { isAsyncIteratorObject, override, toArray, value, wrapAsyncIterator, wrapReadableStream } from '@orpc/shared'
import { flattenStandardHeader, getFilenameFromContentDisposition, resolveStandardBodyHint } from '@standard-server/core'
import { toFetchHeaders, toStandardBody } from '@standard-server/fetch'
import { parseHeaderParameters, parseMultipart } from './multipart'

export interface TmpFileUploadHandlerPluginMaxBodySize {
  /**
   * The maximum size in bytes of request body content buffered into memory:
   * JSON, URL-encoded forms, and the fields, part headers, and in-memory files
   * of a multipart body in total, and each event of an event stream on its
   * own. Exceeding it rejects with `PAYLOAD_TOO_LARGE`, except for uploads,
   * which spool to disk instead once they no longer fit. Usually the lowest of
   * the three limits, because this content cannot stream anywhere.
   */
  memory: number

  /**
   * The maximum total size in bytes of uploaded file content: file bodies and
   * the file parts of a multipart body combined, whether held in memory or
   * spooled to temporary files. A larger body rejects the request with
   * `PAYLOAD_TOO_LARGE`.
   */
  file: number

  /**
   * The maximum total size in bytes of a request body that is consumed as a
   * stream: event streams and raw binary streams. Enforced while the stream is
   * consumed, so an oversized stream fails at the reader. Usually the highest
   * of the three limits, but keep it finite so no client can stream
   * indefinitely.
   */
  stream: number
}

export interface TmpFileUploadHandlerPluginOptions<T extends Context> {
  /**
   * The directory temporary files are created under. Each request that spools
   * an upload gets its own subdirectory inside it, removed when the request
   * finishes.
   *
   * @default os.tmpdir()
   */
  tmpDir?: string

  /**
   * The size limit for each kind of request body, either fixed or resolved
   * per request, so limits can follow the request itself, such as a larger
   * allowance for an authenticated user than for a guest. Every kind is
   * required when the option is given, so none is left unbounded by accident;
   * set a kind to `Number.POSITIVE_INFINITY` to deliberately leave it
   * unlimited.
   *
   * A resolver runs only when a body is parsed, so a request without one never
   * pays for it, and it receives the request as it arrived, before this plugin
   * wraps its body resolution.
   *
   * @default unlimited for every kind
   */
  maxBodySize?: Value<Promisable<TmpFileUploadHandlerPluginMaxBodySize>, [options: StandardHandlerRoutingInterceptorOptions<T>]>

  /**
   * The size in bytes an uploaded file must exceed before it is spooled to a
   * temporary file. Smaller files stay in memory as plain `File`s, counted
   * against `maxBodySize.memory`, and spool anyway once they no longer fit.
   * Set to `0` to spool every non-empty upload.
   *
   * @default 64 * 1024
   */
  spoolThreshold?: number
}

/**
 * A `File` whose content lives in a temporary file on disk and is read lazily,
 * so it can represent an upload far larger than available memory.
 *
 * @remarks
 * Node's `fs.openAsBlob`, which backs this class, has known bugs with files
 * over 2 GiB ({@link https://github.com/nodejs/node/issues/52585}): `size` is
 * truncated above 4 GiB and `slice()` is unreliable above 2 GiB, while
 * whole-file reads like `stream()` stay correct. When size or random access
 * matters for such a file, stat or read {@link path} directly.
 *
 * @see {@link https://orpc.dev/docs/plugins/tmp-file-upload | Tmp File Upload Plugin}
 */
export class TmpFile extends File {
  constructor(
    blob: Blob,
    /**
     * Absolute path of the temporary file holding this file's content.
     * The file is removed when the request finishes, so move or copy it
     * to keep the content. The `File` reads from this path, so it must
     * not be read after the file is moved or removed.
     */
    readonly path: string,
    name: string,
    options?: FilePropertyBag,
  ) {
    super([blob], name, options)
  }
}

/**
 * Parses file uploads into temporary files instead of memory. Bodies the standard
 * body parser would buffer into an in-memory `File`, and multipart file parts, are
 * streamed to disk once they outgrow the spool threshold and surfaced as lazily read
 * {@link TmpFile} instances, so requests far larger than available memory parse in
 * constant memory. Smaller uploads stay in memory as plain `File`s. Every other body is
 * left to the standard parser.
 *
 * Request body sizes are limited per content category: buffered in memory, uploaded
 * files, and streamed, each limit fixed or resolved per request. This subsumes the
 * request limit plugin while sizing each kind of body to what it actually costs.
 *
 * @remarks
 * Temporary files are removed when the request finishes. A streaming response body,
 * an event iterator or a raw stream, keeps them alive until it completes, so
 * responses that read the upload while streaming work. Any other response is
 * transmitted after removal, so one that embeds the upload itself, as a `File` or
 * inside `FormData`, needs the content copied or the file moved first.
 *
 * @see {@link https://orpc.dev/docs/plugins/tmp-file-upload | Tmp File Upload Plugin}
 */
export class TmpFileUploadHandlerPlugin<T extends Context> implements StandardHandlerPlugin<T> {
  name = '~tmp-file-upload'

  /**
   * Should parse the original request body instead of batched sub-requests.
   */
  after = ['~batch']

  /**
   * Should run inside the limit and compression plugins, so spooling receives
   * the size-checked, decompressed bytes.
   */
  before = ['~request-limit', '~request-compression']

  private readonly tmpDir: string
  private readonly maxBodySize: Exclude<TmpFileUploadHandlerPluginOptions<T>['maxBodySize'], undefined>
  private readonly spoolThreshold: number

  constructor(options: TmpFileUploadHandlerPluginOptions<T> = {}) {
    this.tmpDir = options.tmpDir ?? tmpdir()
    this.maxBodySize = options.maxBodySize ?? {
      memory: Number.POSITIVE_INFINITY,
      file: Number.POSITIVE_INFINITY,
      stream: Number.POSITIVE_INFINITY,
    }
    this.spoolThreshold = options.spoolThreshold ?? 64 * 1024
  }

  init(options: StandardHandlerOptions<T>): StandardHandlerOptions<T> {
    const routingInterceptor: StandardHandlerRoutingInterceptor<T> = async ({ next, ...interceptorOptions }) => {
      const tmpFiles = new RequestTmpFiles(this.tmpDir)
      let cleanupDeferred = false

      try {
        const result = await next({
          ...interceptorOptions,
          request: {
            ...interceptorOptions.request,
            resolveBody: hint => this.resolveBody(interceptorOptions, hint, tmpFiles),
          },
        })

        /**
         * A streaming response body transmits after this interceptor returns and
         * may read the uploaded tmp files while doing so, so their removal rides
         * on the body finishing instead. That covers abandoned transfers too: the
         * adapter cancels the body, which reaches the same finish hook only after
         * any in-flight procedure logic has completed.
         */
        if (result.matched && tmpFiles.inUse) {
          const body = result.response.body

          if (isAsyncIteratorObject(body)) {
            cleanupDeferred = true

            return {
              matched: true,
              response: {
                ...result.response,
                /**
                 * @warning
                 * Remember use `override` for AsyncIteratorObject to remain other special properties
                 */
                body: override(body, wrapAsyncIterator(body, { onFinish: () => tmpFiles.cleanup() })),
              },
            }
          }

          if (body instanceof ReadableStream) {
            cleanupDeferred = true

            return {
              matched: true,
              response: {
                ...result.response,
                /**
                 * @warning
                 * Remember use `override` for ReadableStream to remain other special properties
                 */
                body: override(body, wrapReadableStream(body, { onFinish: () => tmpFiles.cleanup() })),
              },
            }
          }
        }

        return result
      }
      finally {
        if (!cleanupDeferred) {
          await tmpFiles.cleanup()
        }
      }
    }

    return {
      ...options,
      routingInterceptors: [routingInterceptor, ...toArray(options.routingInterceptors)],
    }
  }

  private async resolveBody(
    interceptorOptions: StandardHandlerRoutingInterceptorOptions<T>,
    hint: StandardBodyHint | undefined,
    tmpFiles: RequestTmpFiles,
  ): Promise<StandardBody> {
    const { request } = interceptorOptions

    // The same resolution order the standard body parsers apply
    const resolvedHint = hint ?? resolveStandardBodyHint(request.headers)

    // A body-less request has nothing to limit or spool
    if (resolvedHint === 'none') {
      return request.resolveBody(hint)
    }

    const maxBodySize = await value(this.maxBodySize, interceptorOptions)

    /**
     * A form-data hint always means multipart here, even though it can also
     * arrive explicitly or through the standard-server header on a body that
     * is not. Such a body fails the multipart parse, unlike the standard
     * parser, which would fall back to urlencoded form data.
     */
    if (resolvedHint === 'form-data') {
      return this.parseMultipartBody(request, tmpFiles, maxBodySize)
    }

    if (resolvedHint === 'file') {
      return this.parseFileBody(request, tmpFiles, maxBodySize)
    }

    if (resolvedHint === 'json' || resolvedHint === 'url-search-params') {
      return this.parseLimitedBody(request, hint, resolvedHint, maxBodySize.memory)
    }

    // Streams are consumed on the fly, but the decoder buffers each event whole, however fast the stream is read
    const eventLimit = resolvedHint === 'event-stream' ? maxBodySize.memory : Number.POSITIVE_INFINITY
    return this.parseLimitedBody(request, hint, resolvedHint, maxBodySize.stream, eventLimit)
  }

  /**
   * Enforces size limits on a body the standard parser handles, counting the
   * raw bytes before handing them back for regular parsing.
   */
  private async parseLimitedBody(
    request: StandardLazyRequest,
    hint: StandardBodyHint | undefined,
    resolvedHint: StandardBodyHint,
    limit: number,
    eventLimit = Number.POSITIVE_INFINITY,
  ): Promise<StandardBody> {
    if (limit === Number.POSITIVE_INFINITY && eventLimit === Number.POSITIVE_INFINITY) {
      return request.resolveBody(hint)
    }

    assertContentLengthWithin(request.headers, limit)

    const stream = await request.resolveBody('octet-stream')

    // adapter might not support hint (e.g. peer adapter)
    if (!(stream instanceof ReadableStream)) {
      return stream
    }

    // An event can't outgrow a limit at or above the total one
    const fits = eventLimit < limit ? createEventSizeCheck(eventLimit) : undefined

    const response = new Response(limitStream(stream, limit, fits), {
      headers: toFetchHeaders(request.headers),
    })

    return toStandardBody(response, { hint: resolvedHint })
  }

  private async parseFileBody(request: StandardLazyRequest, tmpFiles: RequestTmpFiles, maxBodySize: TmpFileUploadHandlerPluginMaxBodySize): Promise<StandardBody> {
    assertContentLengthWithin(request.headers, maxBodySize.file)

    const stream = await request.resolveBody('octet-stream')

    // adapter might not support hint (e.g. peer adapter)
    if (!(stream instanceof ReadableStream)) {
      return stream
    }

    const contentDisposition = flattenStandardHeader(request.headers['content-disposition'])
    const fileName = contentDisposition !== undefined ? getFilenameFromContentDisposition(contentDisposition) : undefined
    const contentType = flattenStandardHeader(request.headers['content-type'])

    const upload = new UploadWriter(tmpFiles, new Budget(maxBodySize.memory), new Budget(maxBodySize.file), this.spoolThreshold)

    for await (const chunk of stream) {
      await upload.write(chunk)
    }

    return upload.end(fileName ?? 'blob', contentType ?? '')
  }

  private async parseMultipartBody(request: StandardLazyRequest, tmpFiles: RequestTmpFiles, maxBodySize: TmpFileUploadHandlerPluginMaxBodySize): Promise<StandardBody> {
    const contentType = flattenStandardHeader(request.headers['content-type'])
    const boundary = contentType === undefined ? undefined : parseHeaderParameters(contentType).get('boundary')

    if (boundary === undefined || boundary === '') {
      throw new TypeError('Invalid multipart body: content-type header is missing the boundary parameter')
    }

    /**
     * The whole multipart body, framing included, can never exceed what its two
     * content categories allow together.
     */
    const totalLimit = maxBodySize.memory + maxBodySize.file

    assertContentLengthWithin(request.headers, totalLimit)

    const stream = await request.resolveBody('octet-stream')

    // adapter might not support hint (e.g. peer adapter)
    if (!(stream instanceof ReadableStream)) {
      return stream
    }

    const limited = totalLimit === Number.POSITIVE_INFINITY ? stream : limitStream(stream, totalLimit)

    const form = new FormData()
    const memory = new Budget(maxBodySize.memory)
    const file = new Budget(maxBodySize.file)

    await parseMultipart(limited, boundary, (part) => {
      const name = part.name

      memory.charge(part.headerSize)

      if (part.filename === undefined) {
        const chunks: Buffer[] = []

        return {
          write: (chunk) => {
            memory.charge(chunk.length)

            // The parser only guarantees the chunk until write returns, so retaining it requires a copy
            chunks.push(Buffer.from(chunk))
          },
          end: () => {
            form.append(name, Buffer.concat(chunks).toString())
          },
        }
      }

      const filename = part.filename
      // A part without a content-type defaults to text/plain, matching the standard parser
      const type = part.type ?? 'text/plain'
      const upload = new UploadWriter(tmpFiles, memory, file, this.spoolThreshold)

      return {
        write: chunk => upload.write(chunk),
        end: async () => {
          form.append(name, await upload.end(filename, type))
        },
      }
    })

    return form
  }
}

/**
 * Rejects early when the declared length already exceeds the limit. The length
 * can lie, so the streaming enforcement stays either way.
 */
function assertContentLengthWithin(headers: StandardHeaders, limit: number): void {
  const contentLength = Number(flattenStandardHeader(headers['content-length']))

  if (Number.isFinite(contentLength) && contentLength > limit) {
    throw new ORPCError('PAYLOAD_TOO_LARGE')
  }
}

/**
 * Limits a stream's total size, also rejecting once `fits` refuses a chunk.
 * `fits` sees every chunk in order, so it can keep state across them.
 */
function limitStream(
  stream: ReadableStream<Uint8Array>,
  limit: number,
  fits: (chunk: Uint8Array) => boolean = () => true,
): ReadableStream<Uint8Array> {
  let total = 0

  return stream.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      total += chunk.byteLength

      if (total > limit || !fits(chunk)) {
        controller.error(new ORPCError('PAYLOAD_TOO_LARGE'))
        return
      }

      controller.enqueue(chunk)
    },
  }))
}

const CR = 0x0D
const LF = 0x0A

/**
 * Counts each event's bytes across chunks until its blank line, since the
 * decoder buffers the whole event, and fails once one outgrows the limit. Scans
 * raw bytes, as UTF-8 never puts CR or LF in a multi-byte character.
 */
function createEventSizeCheck(eventLimit: number): (chunk: Uint8Array) => boolean {
  let eventSize = 0
  // The event's trailing line ending: none, a lone CR, or a complete one
  let trailing: 'none' | 'cr' | 'line' = 'none'

  return (chunk) => {
    // Buffer's native indexOf skips the content between line endings
    const bytes = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)
    let nextCR = indexOrEnd(bytes, CR, 0)
    let nextLF = indexOrEnd(bytes, LF, 0)
    let offset = 0

    while (true) {
      const lineEnding = Math.min(nextCR, nextLF)

      if (lineEnding > offset) {
        eventSize += lineEnding - offset
        trailing = 'none'
      }

      if (lineEnding === bytes.length) {
        return eventSize <= eventLimit
      }

      const byte = bytes[lineEnding]
      offset = lineEnding + 1

      if (byte === CR) {
        nextCR = indexOrEnd(bytes, CR, offset)
      }
      else {
        nextLF = indexOrEnd(bytes, LF, offset)
      }

      // The decoder skips line endings before an event
      if (eventSize === 0) {
        continue
      }

      if (++eventSize > eventLimit) {
        return false
      }

      if (trailing === 'line' || (trailing === 'cr' && byte === CR)) {
        // A blank line: the decoder releases the event
        eventSize = 0
        trailing = 'none'
      }
      else {
        trailing = byte === CR ? 'cr' : 'line'
      }
    }
  }
}

function indexOrEnd(bytes: Buffer, byte: number, from: number): number {
  const index = bytes.indexOf(byte, from)
  return index === -1 ? bytes.length : index
}

class Budget {
  private used = 0

  constructor(private readonly limit: number) {}

  charge(size: number): void {
    if (!this.tryCharge(size)) {
      throw new ORPCError('PAYLOAD_TOO_LARGE')
    }
  }

  tryCharge(size: number): boolean {
    if (this.used + size > this.limit) {
      return false
    }

    this.used += size
    return true
  }

  refund(size: number): void {
    this.used -= size
  }
}

class UploadWriter {
  private held: Buffer[] = []
  private heldSize = 0
  private tmpPath: string | undefined

  constructor(
    private readonly tmpFiles: RequestTmpFiles,
    private readonly memory: Budget,
    private readonly file: Budget,
    private readonly spoolThreshold: number,
  ) {}

  async write(chunk: Uint8Array): Promise<void> {
    this.file.charge(chunk.length)

    if (this.tmpPath !== undefined) {
      return this.tmpFiles.append(this.tmpPath, chunk)
    }

    if (this.heldSize + chunk.length <= this.spoolThreshold && this.memory.tryCharge(chunk.length)) {
      // Chunks are only guaranteed until write returns, so holding one requires a copy
      this.held.push(Buffer.from(chunk))
      this.heldSize += chunk.length
      return
    }

    this.tmpPath = await this.tmpFiles.create(Buffer.concat([...this.held, chunk]))
    this.memory.refund(this.heldSize)
    this.held = []
  }

  async end(name: string, type: string): Promise<File> {
    if (this.tmpPath !== undefined) {
      return this.tmpFiles.seal(this.tmpPath, name, type)
    }

    // A File keeps one part per chunk, so merge them first
    return new File([Buffer.concat(this.held, this.heldSize)], name, { type })
  }
}

/**
 * Owns every temporary file a request creates: creates them inside one lazily
 * created per-request directory and guarantees removal. Content lands through
 * self-contained appends rather than long-lived handles, so a request holds at
 * most one transient file descriptor per in-flight write no matter how many
 * files it carries, and removal never contends with an open handle on platforms
 * that cannot delete open files.
 *
 * Filesystem failures surface as `INTERNAL_SERVER_ERROR`, keeping them distinct
 * from the malformed-body errors the handler reports as `BAD_REQUEST`. Their
 * details ride only on `cause`, which is never serialized to the client.
 */
class RequestTmpFiles {
  private dir: Promise<string> | undefined
  private count = 0

  constructor(private readonly tmpDir: string) {}

  get inUse(): boolean {
    return this.dir !== undefined
  }

  async create(content: Uint8Array): Promise<string> {
    try {
      this.dir ??= mkdtemp(path.join(this.tmpDir, 'orpc-upload-'))
      const tmpPath = path.join(await this.dir, String(this.count++))
      await appendFile(tmpPath, content)
      return tmpPath
    }
    catch (cause) {
      throw new ORPCError('INTERNAL_SERVER_ERROR', { cause })
    }
  }

  async append(tmpPath: string, chunk: Uint8Array): Promise<void> {
    try {
      await appendFile(tmpPath, chunk)
    }
    catch (cause) {
      throw new ORPCError('INTERNAL_SERVER_ERROR', { cause })
    }
  }

  async seal(tmpPath: string, name: string, type: string): Promise<TmpFile> {
    try {
      return new TmpFile(await openAsBlob(tmpPath), tmpPath, name, { type })
    }
    catch (cause) {
      throw new ORPCError('INTERNAL_SERVER_ERROR', { cause })
    }
  }

  async cleanup(): Promise<void> {
    if (this.dir !== undefined) {
      try {
        await rm(await this.dir, { recursive: true, force: true })
      }
      catch {
        // The request outcome must not change because removal failed
      }
    }
  }
}
