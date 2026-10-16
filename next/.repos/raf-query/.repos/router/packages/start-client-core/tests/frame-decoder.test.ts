import { describe, expect, it, vi } from 'vitest'
import { RawStream, createControlledPromise } from '@tanstack/router-core'
import { createRawStreamRPCPlugin } from '@tanstack/router-core/ssr/server'
import { runWithStartContext } from '@tanstack/start-storage-context'
import { SerovalDeserializationError, toCrossJSONStream } from 'seroval'
import { createFrameDecoder } from '../src/client-rpc/frame-decoder'
import {
  serverFnFetcher,
  trackPostProcessPromise,
} from '../src/client-rpc/serverFnFetcher'
import {
  FRAME_HEADER_SIZE,
  FRAME_TYPE_CHUNK,
  FRAME_TYPE_END,
  FRAME_TYPE_ERROR,
  FRAME_TYPE_JSON,
  MAX_FRAME_PAYLOAD_SIZE,
  MAX_UNREAD_RAW_STREAM_BYTES,
  TSS_CONTENT_TYPE_FRAMED_VERSIONED,
  X_TSS_SERIALIZED,
} from '../src/constants'
import type * as Seroval from 'seroval'

const serovalMocks = vi.hoisted(() => ({
  fromCrossJSON: vi.fn(),
}))

vi.mock('seroval', async (importOriginal) => {
  const actual = await importOriginal<typeof Seroval>()
  serovalMocks.fromCrossJSON.mockImplementation(actual.fromCrossJSON)
  return { ...actual, fromCrossJSON: serovalMocks.fromCrossJSON }
})

/**
 * Helper to encode a frame for testing
 */
function encodeFrame(
  type: number,
  streamId: number,
  payload: Uint8Array,
): Uint8Array {
  const frame = new Uint8Array(FRAME_HEADER_SIZE + payload.length)
  const view = new DataView(frame.buffer)
  view.setUint8(0, type)
  view.setUint32(1, streamId, false)
  view.setUint32(5, payload.length, false)
  frame.set(payload, FRAME_HEADER_SIZE)
  return frame
}

function encodeJSONFrame(json: string): Uint8Array {
  return encodeFrame(FRAME_TYPE_JSON, 0, new TextEncoder().encode(json))
}

function encodeChunkFrame(streamId: number, data: Uint8Array): Uint8Array {
  return encodeFrame(FRAME_TYPE_CHUNK, streamId, data)
}

function encodeEndFrame(streamId: number): Uint8Array {
  return encodeFrame(FRAME_TYPE_END, streamId, new Uint8Array(0))
}

function encodeErrorFrame(streamId: number, message: string): Uint8Array {
  return encodeFrame(
    FRAME_TYPE_ERROR,
    streamId,
    new TextEncoder().encode(message),
  )
}

async function readBytes(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<Uint8Array> {
  const chunks: Array<Uint8Array> = []
  let length = 0
  for (;;) {
    const next = await reader.read()
    if (next.done) {
      break
    }
    chunks.push(next.value)
    length += next.value.byteLength
  }
  const result = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

describe('frame-decoder', () => {
  it('cancels RawStream request serialization when the request is aborted', async () => {
    const cancel = vi.fn(() => new Promise<void>(() => {}))
    const stream = new ReadableStream<Uint8Array>({
      pull: () => new Promise<void>(() => {}),
      cancel,
    })
    const controller = new AbortController()
    const reason = new Error('request aborted')
    const handler = vi.fn()

    const request = runWithStartContext(
      { startOptions: undefined } as any,
      async () =>
        serverFnFetcher(
          'http://localhost/_serverFn/test',
          [
            {
              method: 'POST',
              data: new RawStream(stream),
              signal: controller.signal,
            },
          ],
          handler,
        ),
    )

    await vi.waitFor(() => expect(stream.locked).toBe(true))
    controller.abort(reason)

    await expect(request).rejects.toBe(reason)
    expect(cancel).toHaveBeenCalledExactlyOnceWith(reason)
    expect(handler).not.toHaveBeenCalled()
    expect(stream.locked).toBe(false)
  })

  it('cancels a framed response whose first JSON value is invalid', async () => {
    const cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encodeJSONFrame('{'))
      },
      cancel,
    })

    await expect(
      runWithStartContext({ startOptions: undefined } as any, async () =>
        serverFnFetcher(
          'http://localhost/_serverFn/test',
          [{ method: 'POST' }],
          () =>
            new Response(body, {
              headers: {
                'content-type': TSS_CONTENT_TYPE_FRAMED_VERSIONED,
                [X_TSS_SERIALIZED]: 'true',
              },
            }),
        ),
      ),
    ).rejects.toBeInstanceOf(SyntaxError)

    expect(cancel).toHaveBeenCalledOnce()
    await vi.waitFor(() => expect(body.locked).toBe(false))
  })

  it.each([
    ['JSON', 'application/json', false],
    ['framed', TSS_CONTENT_TYPE_FRAMED_VERSIONED, true],
  ])(
    'observes tracked post-processing when initial %s deserialization throws',
    async (_name, contentType, framed) => {
      const observe = vi.fn(() => Promise.resolve())
      const tracked = { catch: observe } as unknown as Promise<unknown>
      const error = new Error('deserialization failed')
      serovalMocks.fromCrossJSON.mockImplementationOnce(() => {
        trackPostProcessPromise(tracked)
        throw error
      })

      const cancel = vi.fn()
      const body = framed
        ? new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(encodeJSONFrame('{}'))
            },
            cancel,
          })
        : '{}'

      await expect(
        runWithStartContext({ startOptions: undefined } as any, async () =>
          serverFnFetcher(
            'http://localhost/_serverFn/test',
            [{ method: 'POST' }],
            () =>
              new Response(body, {
                headers: {
                  'content-type': contentType,
                  [X_TSS_SERIALIZED]: 'true',
                },
              }),
          ),
        ),
      ).rejects.toBe(error)

      expect(observe).toHaveBeenCalledOnce()
      if (framed) {
        expect(cancel).toHaveBeenCalledOnce()
        await vi.waitFor(() =>
          expect((body as ReadableStream).locked).toBe(false),
        )
      }
    },
  )

  it('continues framed patches without awaiting their post-processing', async () => {
    let releaseGate!: () => void
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve
    })
    let resolveLastPatch!: () => void
    const lastPatch = new Promise<void>((resolve) => {
      resolveLastPatch = resolve
    })
    const result = { ok: true }

    serovalMocks.fromCrossJSON
      .mockImplementationOnce(() => result)
      .mockImplementationOnce(() => {
        trackPostProcessPromise(gate)
      })
      .mockImplementationOnce(() => {
        releaseGate()
        resolveLastPatch()
      })

    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encodeJSONFrame('{}'))
        controller.enqueue(encodeJSONFrame('{}'))
        controller.enqueue(encodeJSONFrame('{}'))
        controller.close()
      },
    })

    const request = runWithStartContext(
      { startOptions: undefined } as any,
      async () =>
        serverFnFetcher(
          'http://localhost/_serverFn/test',
          [{ method: 'POST' }],
          () =>
            new Response(body, {
              headers: {
                'content-type': TSS_CONTENT_TYPE_FRAMED_VERSIONED,
                [X_TSS_SERIALIZED]: 'true',
              },
            }),
        ),
    )

    await lastPatch
    await expect(request).resolves.toBe(result)
    await vi.waitFor(() => expect(body.locked).toBe(false))
  })

  it.each(['invalid JSON', 'invalid patch', 'read failure'] as const)(
    'cancels the response and fails raw streams after %s',
    async (failure) => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => {})
      const cancel = vi.fn()
      let controller!: ReadableStreamDefaultController<Uint8Array>
      const body = new ReadableStream<Uint8Array>({
        start(value) {
          controller = value
        },
        cancel,
      })
      const ready = createControlledPromise<string>()
      const dispose = toCrossJSONStream(
        {
          ready,
          raw: new RawStream(new ReadableStream<Uint8Array>()),
        },
        {
          refs: new Map(),
          plugins: [createRawStreamRPCPlugin(() => {})],
          onParse(value) {
            controller.enqueue(encodeJSONFrame(JSON.stringify(value)))
          },
        },
      )

      try {
        const result = await runWithStartContext(
          { startOptions: undefined } as any,
          async () =>
            serverFnFetcher(
              'http://localhost/_serverFn/test',
              [{ method: 'POST' }],
              () =>
                new Response(body, {
                  headers: {
                    'content-type': TSS_CONTENT_TYPE_FRAMED_VERSIONED,
                    [X_TSS_SERIALIZED]: 'true',
                  },
                }),
            ),
        )
        const rawReader = result.raw.getReader()

        ready.resolve('ready')
        await expect(result.ready).resolves.toBe('ready')
        const failures = Promise.allSettled([rawReader.read()])

        const transportError = new Error('transport failed')
        if (failure === 'read failure') {
          controller.error(transportError)
        } else {
          controller.enqueue(
            encodeJSONFrame(failure === 'invalid JSON' ? '{' : '{}'),
          )
        }

        await vi.waitFor(() => expect(log).toHaveBeenCalledOnce())
        const error = log.mock.calls[0]![1]
        if (failure === 'read failure') {
          expect(error).toBe(transportError)
        } else {
          expect(error).toBeInstanceOf(
            failure === 'invalid JSON'
              ? SyntaxError
              : SerovalDeserializationError,
          )
          expect(cancel).toHaveBeenCalledExactlyOnceWith(error)
        }
        await expect(failures).resolves.toEqual([
          { status: 'rejected', reason: error },
        ])
        await expect(result.ready).resolves.toBe('ready')
        rawReader.releaseLock()
        await vi.waitFor(() => expect(body.locked).toBe(false))
      } finally {
        dispose()
        log.mockRestore()
      }
    },
  )

  // Promises and streams that Seroval created from earlier records cannot be
  // settled by the client after a transport failure without a Seroval API for
  // aborting a cross-JSON deserialization session.
  it.todo('rejects pending framed promises after a transport failure')

  it('cancels the response when the initial framed deserialization fails', async () => {
    const error = new Error('initial deserialization failed')
    serovalMocks.fromCrossJSON.mockImplementationOnce(() => {
      throw error
    })

    const cancel = vi.fn()
    let controller!: ReadableStreamDefaultController<Uint8Array>
    const body = new ReadableStream<Uint8Array>({
      start(value) {
        controller = value
      },
      cancel,
    })
    const dispose = toCrossJSONStream(
      { value: 'first' },
      {
        refs: new Map(),
        onParse(value) {
          controller.enqueue(encodeJSONFrame(JSON.stringify(value)))
        },
      },
    )

    try {
      await expect(
        runWithStartContext({ startOptions: undefined } as any, async () =>
          serverFnFetcher(
            'http://localhost/_serverFn/test',
            [{ method: 'POST' }],
            () =>
              new Response(body, {
                headers: {
                  'content-type': TSS_CONTENT_TYPE_FRAMED_VERSIONED,
                  [X_TSS_SERIALIZED]: 'true',
                },
              }),
          ),
        ),
      ).rejects.toBe(error)
      expect(cancel).toHaveBeenCalledExactlyOnceWith(error)
      await vi.waitFor(() => expect(body.locked).toBe(false))
    } finally {
      dispose()
    }
  })

  describe('createFrameDecoder', () => {
    it('should throw synchronously when the input is already locked', () => {
      const input = new ReadableStream<Uint8Array>()
      const reader = input.getReader()

      try {
        expect(() => createFrameDecoder(input)).toThrow()
      } finally {
        reader.releaseLock()
      }
    })

    it('should ignore empty input chunks', async () => {
      const input = new ReadableStream<Uint8Array>({
        start(controller) {
          for (let index = 0; index < 1_000; index++) {
            controller.enqueue(new Uint8Array())
          }
          controller.enqueue(encodeJSONFrame('{"ok":true}'))
          controller.close()
        },
      })

      const [chunks] = createFrameDecoder(input)
      const reader = chunks.getReader()
      await expect(reader.read()).resolves.toEqual({
        done: false,
        value: '{"ok":true}',
      })
      await expect(reader.read()).resolves.toEqual({
        done: true,
        value: undefined,
      })
    })

    it('should reject unknown frame type', async () => {
      const badFrame = encodeFrame(99, 0, new Uint8Array(0))
      let cancelReason: unknown
      const input = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(badFrame)
        },
        cancel(reason) {
          cancelReason = reason
        },
      })

      const [jsonChunks] = createFrameDecoder(input)
      const reader = jsonChunks.getReader()

      await expect(reader.read()).rejects.toThrow('Invalid frame')
      expect(cancelReason).toBeInstanceOf(Error)
      expect(input.locked).toBe(false)
    })

    it('should reject raw frames with streamId 0', async () => {
      const badChunk = encodeFrame(FRAME_TYPE_CHUNK, 0, new Uint8Array([1]))
      const input = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(badChunk)
          controller.close()
        },
      })

      const [jsonChunks] = createFrameDecoder(input)
      const reader = jsonChunks.getReader()

      await expect(reader.read()).rejects.toThrow('Invalid frame')
    })

    it('should reject JSON frames with non-zero streamId', async () => {
      const badJson = encodeFrame(
        FRAME_TYPE_JSON,
        1,
        new TextEncoder().encode('{}\n'),
      )
      const input = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(badJson)
          controller.close()
        },
      })

      const [jsonChunks] = createFrameDecoder(input)
      const reader = jsonChunks.getReader()

      await expect(reader.read()).rejects.toThrow('Invalid frame')
    })

    it('should reject oversized frame payloads', async () => {
      // Declare a payload length > MAX_FRAME_PAYLOAD_SIZE with no payload.
      const headerOnly = new Uint8Array(FRAME_HEADER_SIZE)
      const view = new DataView(headerOnly.buffer)
      view.setUint8(0, FRAME_TYPE_JSON)
      view.setUint32(1, 0, false)
      view.setUint32(5, 16 * 1024 * 1024 + 1, false)

      const input = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(headerOnly)
          controller.close()
        },
      })

      const [jsonChunks] = createFrameDecoder(input)
      const reader = jsonChunks.getReader()

      await expect(reader.read()).rejects.toThrow('Invalid frame')
    })

    it('should reject incomplete frames at end-of-stream', async () => {
      const headerOnly = new Uint8Array(FRAME_HEADER_SIZE)
      const view = new DataView(headerOnly.buffer)
      view.setUint8(0, FRAME_TYPE_JSON)
      view.setUint32(1, 0, false)
      view.setUint32(5, 3, false)

      const input = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(headerOnly)
          controller.close()
        },
      })

      const [jsonChunks] = createFrameDecoder(input)
      const reader = jsonChunks.getReader()

      await expect(reader.read()).rejects.toThrow('Incomplete frame')
    })

    it('should reject END frames with a payload', async () => {
      const input = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encodeFrame(FRAME_TYPE_END, 1, new Uint8Array([1])),
          )
        },
      })

      const [chunks] = createFrameDecoder(input)
      await expect(chunks.getReader().read()).rejects.toThrow('Invalid frame')
    })

    it('should reject invalid getStream IDs', async () => {
      const input = new ReadableStream<Uint8Array>({ pull() {} })
      const [chunks, getStream] = createFrameDecoder(input)

      for (const id of [0, -1, 1.5, 0x1_0000_0000, NaN, Infinity]) {
        expect(() => getStream(id)).toThrow('Invalid raw stream ID')
      }
      const maxStream = getStream(0xffff_ffff)
      expect(getStream(0xffff_ffff)).toBe(maxStream)
      await chunks.cancel()
    })

    it('should reject frames after a raw stream has ended', async () => {
      const firstEnd = encodeEndFrame(1)
      const secondEnd = encodeEndFrame(1)
      const input = new ReadableStream<Uint8Array>({
        start(controller) {
          const frames = new Uint8Array(firstEnd.length + secondEnd.length)
          frames.set(firstEnd)
          frames.set(secondEnd, firstEnd.length)
          controller.enqueue(frames)
        },
      })

      const [chunks] = createFrameDecoder(input)
      await expect(chunks.getReader().read()).rejects.toThrow(
        'Raw stream already ended',
      )
    })

    it('rejects a header-only CHUNK for an ended stream without pulling its payload', async () => {
      const chunkHeader = encodeChunkFrame(1, new Uint8Array())
      new DataView(chunkHeader.buffer).setUint32(
        5,
        MAX_FRAME_PAYLOAD_SIZE,
        false,
      )
      const frames = [encodeEndFrame(1), chunkHeader]
      let pulls = 0
      const input = new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            pulls++
            const frame = frames.shift()
            if (!frame) {
              throw new Error('Payload was pulled')
            }
            controller.enqueue(frame)
          },
        },
        { highWaterMark: 0 },
      )

      const [chunks] = createFrameDecoder(input)
      await expect(chunks.getReader().read()).rejects.toThrow(
        'Raw stream already ended',
      )
      expect(pulls).toBe(2)
    })

    it('returns stable closed streams after completion', async () => {
      const input = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close()
        },
      })
      const [chunks, getStream] = createFrameDecoder(input)

      await expect(chunks.getReader().read()).resolves.toEqual({
        done: true,
        value: undefined,
      })
      const stream = getStream(1)
      expect(getStream(1)).toBe(stream)
      await expect(stream.getReader().read()).resolves.toEqual({
        done: true,
        value: undefined,
      })
    })

    it('errors active and late streams after a fatal frame', async () => {
      const json = encodeJSONFrame('{"ref":1}')
      const malformed = encodeFrame(99, 0, new Uint8Array())
      const cancel = vi.fn()
      const input = new ReadableStream<Uint8Array>({
        start(controller) {
          const frames = new Uint8Array(json.length + malformed.length)
          frames.set(json)
          frames.set(malformed, json.length)
          controller.enqueue(frames)
        },
        cancel,
      })
      const [chunks, getStream] = createFrameDecoder(input)
      const jsonReader = chunks.getReader()

      await jsonReader.read()
      const active = getStream(1)
      await expect(jsonReader.read()).rejects.toThrow('Invalid frame')
      await expect(active.getReader().read()).rejects.toThrow('Invalid frame')
      const late = getStream(2)
      expect(getStream(2)).toBe(late)
      await expect(late.getReader().read()).rejects.toThrow('Invalid frame')
      expect(cancel).toHaveBeenCalledOnce()
      expect(input.locked).toBe(false)
    })

    it('errors a raw stream when input ends without END', async () => {
      const json = encodeJSONFrame('{"ref":1}')
      const chunk = encodeChunkFrame(1, new Uint8Array([1]))
      const input = new ReadableStream<Uint8Array>({
        start(controller) {
          const frames = new Uint8Array(json.length + chunk.length)
          frames.set(json)
          frames.set(chunk, json.length)
          controller.enqueue(frames)
          controller.close()
        },
      })
      const [chunks, getStream] = createFrameDecoder(input)
      const jsonReader = chunks.getReader()
      await jsonReader.read()
      const rawReader = getStream(1).getReader()

      await expect(rawReader.read()).resolves.toEqual({
        done: false,
        value: new Uint8Array([1]),
      })
      await expect(rawReader.read()).rejects.toThrow('Incomplete raw stream')
      await expect(jsonReader.read()).rejects.toThrow('Incomplete raw stream')
    })

    it('accepts clean EOF for a cancelled raw stream', async () => {
      let inputController!: ReadableStreamDefaultController<Uint8Array>
      const input = new ReadableStream<Uint8Array>({
        start(controller) {
          inputController = controller
        },
      })
      const [chunks, getStream] = createFrameDecoder(input)
      const jsonReader = chunks.getReader()

      inputController.enqueue(encodeJSONFrame('{"ref":1}'))
      await jsonReader.read()
      await getStream(1).cancel()
      inputController.close()

      await expect(jsonReader.read()).resolves.toEqual({
        done: true,
        value: undefined,
      })
    })

    it('accepts clean EOF after cancelling an unread stream that received END', async () => {
      let inputController!: ReadableStreamDefaultController<Uint8Array>
      let pulls = 0
      const frames = [
        encodeJSONFrame('{"ref":1}'),
        encodeChunkFrame(1, new Uint8Array([1])),
        encodeEndFrame(1),
      ]
      const input = new ReadableStream<Uint8Array>(
        {
          start(controller) {
            inputController = controller
          },
          pull(controller) {
            pulls++
            const frame = frames.shift()
            if (frame) {
              controller.enqueue(frame)
            }
          },
        },
        { highWaterMark: 0 },
      )
      const [chunks, getStream] = createFrameDecoder(input)
      const jsonReader = chunks.getReader()

      await expect(jsonReader.read()).resolves.toEqual({
        done: false,
        value: '{"ref":1}',
      })
      const rawStream = getStream(1)
      await vi.waitFor(() => expect(pulls).toBe(4))
      await rawStream.cancel('unused')
      inputController.close()

      await expect(jsonReader.read()).resolves.toEqual({
        done: true,
        value: undefined,
      })
    })

    it('should cancel input when jsonChunks cancelled', async () => {
      let cancelled = false
      const input = new ReadableStream<Uint8Array>({
        pull() {},
        cancel() {
          cancelled = true
        },
      })

      const [jsonChunks] = createFrameDecoder(input)
      const reader = jsonChunks.getReader()

      await reader.cancel()
      expect(cancelled).toBe(true)
    })

    it('does not decode a payload after JSON cancellation wins its read', async () => {
      const first = encodeJSONFrame('{"first":true}')
      const second = encodeJSONFrame('{"second":true}')
      const firstInput = new Uint8Array(first.length + FRAME_HEADER_SIZE)
      firstInput.set(first)
      firstInput.set(second.subarray(0, FRAME_HEADER_SIZE), first.length)

      let pulls = 0
      let jsonReader!: ReadableStreamDefaultReader<string>
      const cancel = vi.fn()
      const decode = vi.spyOn(TextDecoder.prototype, 'decode')
      const input = new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            if (pulls++ === 0) {
              controller.enqueue(firstInput)
            } else {
              queueMicrotask(() => void jsonReader.cancel('stop'))
              controller.enqueue(second.subarray(FRAME_HEADER_SIZE))
            }
          },
          cancel,
        },
        { highWaterMark: 0 },
      )

      try {
        const [chunks] = createFrameDecoder(input)
        jsonReader = chunks.getReader()
        await expect(jsonReader.read()).resolves.toEqual({
          done: false,
          value: '{"first":true}',
        })
        decode.mockClear()

        await vi.waitFor(() => expect(input.locked).toBe(false))
        expect(decode).not.toHaveBeenCalled()
        expect(cancel).toHaveBeenCalledWith('stop')
      } finally {
        decode.mockRestore()
      }
    })

    it('continues decoding while a raw chunk is unread', async () => {
      const frames = [
        encodeJSONFrame('{"ref":1}'),
        encodeChunkFrame(1, new Uint8Array([1])),
        encodeJSONFrame('{"after":true}'),
        encodeEndFrame(1),
      ]
      let pulls = 0
      const input = new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            const frame = frames[pulls++]
            if (frame) {
              controller.enqueue(frame)
            } else {
              controller.close()
            }
          },
        },
        { highWaterMark: 0 },
      )

      const [chunks, getStream] = createFrameDecoder(input)
      const jsonReader = chunks.getReader()
      await expect(jsonReader.read()).resolves.toEqual({
        done: false,
        value: '{"ref":1}',
      })
      const rawStream = getStream(1)
      await expect(jsonReader.read()).resolves.toEqual({
        done: false,
        value: '{"after":true}',
      })

      const rawReader = rawStream.getReader()
      await expect(rawReader.read()).resolves.toEqual({
        done: false,
        value: new Uint8Array([1]),
      })
      await expect(rawReader.read()).resolves.toEqual({
        done: true,
        value: undefined,
      })
      expect(getStream(1)).toBe(rawStream)
    })

    it('keeps the multiplexed response active after one raw stream is cancelled', async () => {
      const frames = [
        encodeJSONFrame('{"refs":[1,2]}'),
        encodeChunkFrame(1, new Uint8Array([1])),
        encodeChunkFrame(1, new Uint8Array([2])),
        encodeEndFrame(1),
        encodeChunkFrame(2, new Uint8Array([3])),
        encodeEndFrame(2),
        encodeJSONFrame('{"after":true}'),
      ]
      let pulls = 0
      const input = new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            const frame = frames[pulls++]
            if (frame) {
              controller.enqueue(frame)
            } else {
              controller.close()
            }
          },
        },
        { highWaterMark: 0 },
      )

      const [chunks, getStream] = createFrameDecoder(input)
      const jsonReader = chunks.getReader()
      await jsonReader.read()
      const blockingStream = getStream(1)
      const otherReader = getStream(2).getReader()
      const otherRead = otherReader.read()
      await vi.waitFor(() => expect(pulls).toBe(frames.length))

      await blockingStream.cancel('unused')
      await expect(otherRead).resolves.toEqual({
        done: false,
        value: new Uint8Array([3]),
      })
      await expect(otherReader.read()).resolves.toEqual({
        done: true,
        value: undefined,
      })
      await expect(jsonReader.read()).resolves.toEqual({
        done: false,
        value: '{"after":true}',
      })
      await expect(jsonReader.read()).resolves.toEqual({
        done: true,
        value: undefined,
      })
      expect(getStream(1)).toBe(blockingStream)
      await expect(blockingStream.getReader().read()).resolves.toEqual({
        done: true,
        value: undefined,
      })
    })

    it('streams more than the old 16 MiB queue limit when consumed', async () => {
      const payload = new Uint8Array(1024 * 1024)
      let frame = 0
      const input = new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            if (frame++ === 0) {
              controller.enqueue(encodeJSONFrame('{"ref":1}'))
            } else if (frame <= 18) {
              controller.enqueue(encodeChunkFrame(1, payload))
            } else if (frame === 19) {
              controller.enqueue(encodeEndFrame(1))
            } else {
              controller.close()
            }
          },
        },
        { highWaterMark: 0 },
      )

      const [chunks, getStream] = createFrameDecoder(input)
      const jsonReader = chunks.getReader()
      await jsonReader.read()
      const rawReader = getStream(1).getReader()
      let bytes = 0
      for (;;) {
        const next = await rawReader.read()
        if (next.done) {
          break
        }
        bytes += next.value.byteLength
      }

      expect(bytes).toBe(17 * 1024 * 1024)
      await expect(jsonReader.read()).resolves.toEqual({
        done: true,
        value: undefined,
      })
    })

    it('cancelling JSON aborts the response while a raw chunk is unread', async () => {
      let pulls = 0
      let inputCancelReason: unknown
      const frames = [
        encodeJSONFrame('{"ref":1}'),
        encodeChunkFrame(1, new Uint8Array([1])),
      ]
      const input = new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            const frame = frames[pulls++]
            if (frame) {
              controller.enqueue(frame)
            }
          },
          cancel(reason) {
            inputCancelReason = reason
          },
        },
        { highWaterMark: 0 },
      )

      const [chunks, getStream] = createFrameDecoder(input)
      const jsonReader = chunks.getReader()
      await jsonReader.read()
      const rawStream = getStream(1)
      await vi.waitFor(() => expect(pulls).toBe(frames.length + 1))

      const reason = 'stop'
      await jsonReader.cancel(reason)
      await expect(rawStream.getReader().read()).rejects.toBe(reason)
      expect(inputCancelReason).toBe(reason)
      await vi.waitFor(() => expect(input.locked).toBe(false))
      // A stream requested after cancellation fails the same way.
      await expect(getStream(2).getReader().read()).rejects.toBe(reason)
    })

    it.each(['A first', 'B first'] as const)(
      'fails only the over-limit raw stream with %s frames',
      async (order) => {
        const aChunk = encodeChunkFrame(1, new Uint8Array(1024 * 1024))
        const aFrameCount = MAX_UNREAD_RAW_STREAM_BYTES / (1024 * 1024) + 2
        const aFrames = Array.from({ length: aFrameCount }, () => aChunk)
        const bFrames = [
          encodeChunkFrame(2, Uint8Array.of(1, 2)),
          encodeChunkFrame(2, Uint8Array.of(3, 4)),
          encodeEndFrame(2),
        ]
        const frames = [
          encodeJSONFrame('{"refs":[1,2]}'),
          ...(order === 'A first' ? aFrames : bFrames),
          ...(order === 'A first' ? bFrames : aFrames),
          encodeChunkFrame(1, Uint8Array.of(9)),
          encodeEndFrame(1),
          encodeJSONFrame('{"after":true}'),
        ]
        let pulls = 0
        const input = new ReadableStream<Uint8Array>(
          {
            pull(controller) {
              const frame = frames[pulls++]
              if (frame) {
                controller.enqueue(frame)
              } else {
                controller.close()
              }
            },
          },
          { highWaterMark: 0 },
        )

        const [chunks, getStream] = createFrameDecoder(input)
        const jsonReader = chunks.getReader()
        await expect(jsonReader.read()).resolves.toEqual({
          done: false,
          value: '{"refs":[1,2]}',
        })
        const aReader = getStream(1).getReader()
        const bReader = getStream(2).getReader()

        await expect(readBytes(bReader)).resolves.toEqual(
          Uint8Array.of(1, 2, 3, 4),
        )
        await expect(jsonReader.read()).resolves.toEqual({
          done: false,
          value: '{"after":true}',
        })
        await expect(aReader.read()).rejects.toThrow(
          'Raw stream 1 has too many unread bytes',
        )
        await expect(jsonReader.read()).resolves.toEqual({
          done: true,
          value: undefined,
        })
        expect(pulls).toBe(frames.length + 1)
      },
    )

    it('copies a small chunk instead of pinning its network buffer', async () => {
      const network = new Uint8Array(4096)
      const frame = encodeChunkFrame(1, Uint8Array.of(1, 2, 3))
      network.set(frame)
      const input = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encodeJSONFrame('{}'))
          controller.enqueue(network.subarray(0, frame.byteLength))
          controller.enqueue(encodeEndFrame(1))
          controller.close()
        },
      })

      const [chunks, getStream] = createFrameDecoder(input)
      const raw = getStream(1).getReader()
      await chunks.getReader().read()
      const { value } = await raw.read()
      expect(Array.from(value!)).toEqual([1, 2, 3])
      expect(value!.buffer.byteLength).toBe(3)
    })

    it('should reject too many raw streams', async () => {
      // END frames create streams, even with no CHUNKs.
      const frames: Array<Uint8Array> = []
      for (let i = 1; i <= 1025; i++) {
        frames.push(encodeEndFrame(i))
      }

      const totalLen = frames.reduce((acc, f) => acc + f.length, 0)
      const combined = new Uint8Array(totalLen)
      let offset = 0
      for (const frame of frames) {
        combined.set(frame, offset)
        offset += frame.length
      }

      const input = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(combined)
          controller.close()
        },
      })

      const [jsonChunks] = createFrameDecoder(input)
      const reader = jsonChunks.getReader()

      await expect(reader.read()).rejects.toThrow('Too many raw streams')
    })

    it('rejects a header-only CHUNK for a 1025th stream without pulling its payload', async () => {
      const chunkHeader = encodeChunkFrame(1025, new Uint8Array())
      new DataView(chunkHeader.buffer).setUint32(
        5,
        MAX_FRAME_PAYLOAD_SIZE,
        false,
      )
      let releaseHeader!: () => void
      const headerReady = new Promise<void>((resolve) => {
        releaseHeader = resolve
      })
      let pulls = 0
      const input = new ReadableStream<Uint8Array>(
        {
          async pull(controller) {
            pulls++
            if (pulls > 1) {
              throw new Error('Payload was pulled')
            }
            await headerReady
            controller.enqueue(chunkHeader)
          },
        },
        { highWaterMark: 0 },
      )
      const [chunks, getStream] = createFrameDecoder(input)
      for (let id = 1; id <= 1024; id++) {
        getStream(id)
      }

      releaseHeader()
      await expect(chunks.getReader().read()).rejects.toThrow(
        'Too many raw streams',
      )
      expect(pulls).toBe(1)
    })

    it('should count cancelled raw streams toward the stream limit', async () => {
      const input = new ReadableStream<Uint8Array>({ pull() {} })
      const [chunks, getStream] = createFrameDecoder(input)

      for (let id = 1; id <= 1024; id++) {
        await getStream(id).cancel()
      }

      expect(() => getStream(1025)).toThrow('Too many raw streams')
      await chunks.cancel()
    })

    it('should decode JSON frames', async () => {
      const frame1 = encodeJSONFrame('{"line":1}')
      const frame2 = encodeJSONFrame('{"line":2}')

      const combinedFrames = new Uint8Array(frame1.length + frame2.length)
      combinedFrames.set(frame1, 0)
      combinedFrames.set(frame2, frame1.length)

      const input = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(combinedFrames)
          controller.close()
        },
      })

      const [jsonChunks] = createFrameDecoder(input)

      const reader = jsonChunks.getReader()
      const chunks: Array<string> = []

      for (;;) {
        const { done, value } = await reader.read()
        if (done) {
          break
        }
        chunks.push(value)
      }

      expect(chunks).toEqual(['{"line":1}', '{"line":2}'])
    })

    it('should decode raw stream chunks', async () => {
      const jsonFrame = encodeJSONFrame('{}')
      const chunkFrame = encodeChunkFrame(5, new Uint8Array([1, 2, 3]))
      const endFrame = encodeEndFrame(5)

      const combined = new Uint8Array(
        jsonFrame.length + chunkFrame.length + endFrame.length,
      )
      combined.set(jsonFrame, 0)
      combined.set(chunkFrame, jsonFrame.length)
      combined.set(endFrame, jsonFrame.length + chunkFrame.length)

      const input = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(combined)
          controller.close()
        },
      })

      const [jsonChunks, getOrCreateStream] = createFrameDecoder(input)

      // Pre-create the stream before consuming
      const stream5 = getOrCreateStream(5)

      // Consume JSON first
      const jsonReader = jsonChunks.getReader()
      const { value: jsonValue } = await jsonReader.read()
      expect(jsonValue).toBe('{}')

      // Read the raw stream
      const rawReader = stream5.getReader()
      const { value: rawValue, done: rawDone } = await rawReader.read()

      expect(rawDone).toBe(false)
      expect(rawValue).toEqual(new Uint8Array([1, 2, 3]))

      const { done: finalDone } = await rawReader.read()
      expect(finalDone).toBe(true)
    })

    it('should handle partial frames across chunks', async () => {
      const frame = encodeJSONFrame('{"test":"data"}')

      // Split frame in the middle
      const part1 = frame.slice(0, 5)
      const part2 = frame.slice(5)

      const input = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(part1)
          controller.enqueue(part2)
          controller.close()
        },
      })

      const [jsonChunks] = createFrameDecoder(input)

      const reader = jsonChunks.getReader()
      const chunks: Array<string> = []

      for (;;) {
        const { done, value } = await reader.read()
        if (done) {
          break
        }
        chunks.push(value)
      }

      expect(chunks).toEqual(['{"test":"data"}'])
    })

    it('should decode a frame from one input chunk', async () => {
      const frame = encodeJSONFrame('{"fast":"path"}')

      const input = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(frame)
          controller.close()
        },
      })

      const [jsonChunks] = createFrameDecoder(input)
      const reader = jsonChunks.getReader()
      const { value } = await reader.read()

      expect(value).toBe('{"fast":"path"}')
    })

    it('should decode a header split across input chunks', async () => {
      const frame = encodeJSONFrame('{"slow":"path"}')

      // Split at byte 3, then byte 6, then rest - header is 9 bytes
      const part1 = frame.slice(0, 3) // first 3 bytes of header
      const part2 = frame.slice(3, 6) // next 3 bytes of header
      const part3 = frame.slice(6) // last 3 bytes of header + payload

      const input = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(part1)
          controller.enqueue(part2)
          controller.enqueue(part3)
          controller.close()
        },
      })

      const [jsonChunks] = createFrameDecoder(input)
      const reader = jsonChunks.getReader()
      const { value } = await reader.read()

      expect(value).toBe('{"slow":"path"}')
    })

    it('should handle header split at every byte boundary', async () => {
      // Extreme case: each header byte in separate chunk
      const frame = encodeJSONFrame('{"byte":"split"}')

      // Split into 9 single-byte chunks for header, then payload
      const chunks: Array<Uint8Array> = []
      for (let i = 0; i < FRAME_HEADER_SIZE; i++) {
        chunks.push(frame.slice(i, i + 1))
      }
      chunks.push(frame.slice(FRAME_HEADER_SIZE)) // payload

      const input = new ReadableStream<Uint8Array>({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(chunk)
          }
          controller.close()
        },
      })

      const [jsonChunks] = createFrameDecoder(input)
      const reader = jsonChunks.getReader()
      const { value } = await reader.read()

      expect(value).toBe('{"byte":"split"}')
    })

    it('should handle multiple raw streams', async () => {
      const jsonFrame = encodeJSONFrame('{}')
      const chunk1 = encodeChunkFrame(1, new Uint8Array([10]))
      const chunk2 = encodeChunkFrame(2, new Uint8Array([20]))
      const end1 = encodeEndFrame(1)
      const end2 = encodeEndFrame(2)

      const totalLen =
        jsonFrame.length +
        chunk1.length +
        chunk2.length +
        end1.length +
        end2.length
      const combined = new Uint8Array(totalLen)
      let offset = 0
      for (const frame of [jsonFrame, chunk1, chunk2, end1, end2]) {
        combined.set(frame, offset)
        offset += frame.length
      }

      const input = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(combined)
          controller.close()
        },
      })

      const [jsonChunks, getOrCreateStream] = createFrameDecoder(input)

      // Pre-create streams before consuming
      const stream1 = getOrCreateStream(1)
      const stream2 = getOrCreateStream(2)

      // Drain JSON
      const jsonReader = jsonChunks.getReader()
      await jsonReader.read()

      // Read stream 1
      const reader1 = stream1.getReader()
      const { value: val1 } = await reader1.read()
      expect(val1).toEqual(new Uint8Array([10]))
      await expect(reader1.read()).resolves.toEqual({
        done: true,
        value: undefined,
      })

      // Read stream 2
      const reader2 = stream2.getReader()
      const { value: val2 } = await reader2.read()
      expect(val2).toEqual(new Uint8Array([20]))
      await expect(reader2.read()).resolves.toEqual({
        done: true,
        value: undefined,
      })
    })

    it('should handle error frames for existing streams', async () => {
      const jsonFrame = encodeJSONFrame('{}')
      // Create a stream, then error it immediately
      const chunkFrame = encodeChunkFrame(3, new Uint8Array([1]))
      const errorFrame = encodeErrorFrame(3, 'Stream failed')

      const combined = new Uint8Array(
        jsonFrame.length + chunkFrame.length + errorFrame.length,
      )
      combined.set(jsonFrame, 0)
      combined.set(chunkFrame, jsonFrame.length)
      combined.set(errorFrame, jsonFrame.length + chunkFrame.length)

      const input = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(combined)
          controller.close()
        },
      })

      const [jsonChunks, getOrCreateStream] = createFrameDecoder(input)

      // Pre-create stream 3
      const stream3 = getOrCreateStream(3)

      // Drain JSON
      const jsonReader = jsonChunks.getReader()
      await jsonReader.read()

      const reader = stream3.getReader()
      await expect(reader.read()).resolves.toEqual({
        done: false,
        value: new Uint8Array([1]),
      })
      await expect(reader.read()).rejects.toThrow('Stream failed')
      expect(getOrCreateStream(3)).toBe(stream3)
      await expect(jsonReader.read()).resolves.toEqual({
        done: true,
        value: undefined,
      })
    })

    it('should preserve stream after END frame for late consumers', async () => {
      const jsonFrame = encodeJSONFrame('{"streamRef":7}')
      const chunkFrame = encodeChunkFrame(7, new Uint8Array([42, 43, 44]))
      const endFrame = encodeEndFrame(7)

      const combined = new Uint8Array(
        jsonFrame.length + chunkFrame.length + endFrame.length,
      )
      combined.set(jsonFrame, 0)
      combined.set(chunkFrame, jsonFrame.length)
      combined.set(endFrame, jsonFrame.length + chunkFrame.length)

      const input = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(combined)
          controller.close()
        },
      })

      const [jsonChunks, getOrCreateStream] = createFrameDecoder(input)

      // The reference is admitted before its raw data, so the deserializer can
      // obtain the stream without requiring the decoder to buffer it eagerly.
      const jsonReader = jsonChunks.getReader()
      await expect(jsonReader.read()).resolves.toEqual({
        done: false,
        value: '{"streamRef":7}',
      })
      const stream7 = getOrCreateStream(7)

      // The stream should still have the data that was enqueued
      const rawReader = stream7.getReader()
      const { value, done } = await rawReader.read()

      expect(done).toBe(false)
      expect(value).toEqual(new Uint8Array([42, 43, 44]))

      // Next read should be done (stream was closed by END frame)
      const { done: finalDone } = await rawReader.read()
      expect(finalDone).toBe(true)
      await expect(jsonReader.read()).resolves.toEqual({
        done: true,
        value: undefined,
      })
    })

    it('should preserve chunks when the stream is obtained after its JSON reference', async () => {
      const jsonFrame = encodeJSONFrame('{"ref":9}')
      const chunkFrame1 = encodeChunkFrame(9, new Uint8Array([1, 2]))
      const chunkFrame2 = encodeChunkFrame(9, new Uint8Array([3, 4]))
      const endFrame = encodeEndFrame(9)

      const combined = new Uint8Array(
        jsonFrame.length +
          chunkFrame1.length +
          chunkFrame2.length +
          endFrame.length,
      )
      let offset = 0
      for (const frame of [jsonFrame, chunkFrame1, chunkFrame2, endFrame]) {
        combined.set(frame, offset)
        offset += frame.length
      }

      const input = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(combined)
          controller.close()
        },
      })

      const [jsonChunks, getOrCreateStream] = createFrameDecoder(input)

      const jsonReader = jsonChunks.getReader()
      await expect(jsonReader.read()).resolves.toEqual({
        done: false,
        value: '{"ref":9}',
      })

      const stream9 = getOrCreateStream(9)
      const reader = stream9.getReader()

      const { value: v1 } = await reader.read()
      expect(v1).toEqual(new Uint8Array([1, 2]))

      const { value: v2 } = await reader.read()
      expect(v2).toEqual(new Uint8Array([3, 4]))

      const { done: finalDone } = await reader.read()
      expect(finalDone).toBe(true)
      await expect(jsonReader.read()).resolves.toEqual({
        done: true,
        value: undefined,
      })
    })

    it('should reassemble a chunk payload that spans many small reads', async () => {
      // A large binary payload delivered in tiny network reads exercises the
      // cursor's exact-length assembly path.
      const payload = new Uint8Array(300)
      for (let i = 0; i < payload.length; i++) payload[i] = i % 256

      const jsonFrame = encodeJSONFrame('{"ref":11}')
      const chunkFrame = encodeChunkFrame(11, payload)
      const endFrame = encodeEndFrame(11)

      const combined = new Uint8Array(
        jsonFrame.length + chunkFrame.length + endFrame.length,
      )
      combined.set(jsonFrame, 0)
      combined.set(chunkFrame, jsonFrame.length)
      combined.set(endFrame, jsonFrame.length + chunkFrame.length)

      const input = new ReadableStream<Uint8Array>({
        start(controller) {
          // 7-byte reads: smaller than the 9-byte header and the payload, so
          // both header and payload span multiple input chunks.
          for (let i = 0; i < combined.length; i += 7) {
            controller.enqueue(combined.subarray(i, i + 7))
          }
          controller.close()
        },
      })

      const [jsonChunks, getOrCreateStream] = createFrameDecoder(input)
      const stream11 = getOrCreateStream(11)

      const jsonReader = jsonChunks.getReader()
      const { value: jsonValue } = await jsonReader.read()
      expect(jsonValue).toBe('{"ref":11}')

      const rawReader = stream11.getReader()
      const received: Array<number> = []
      for (;;) {
        const { done, value } = await rawReader.read()
        if (done) {
          break
        }
        received.push(...value)
      }
      expect(received).toEqual(Array.from(payload))
    })

    it('reassembles a large chunk payload delivered one byte at a time', async () => {
      // One-byte reads exercise repeated cursor advancement without repeated
      // concatenation or rescanning.
      const payload = new Uint8Array(200)
      for (let i = 0; i < payload.length; i++) {
        payload[i] = (i * 7) % 256
      }

      const jsonFrame = encodeJSONFrame('{"ref":21}')
      const chunkFrame = encodeChunkFrame(21, payload)
      const endFrame = encodeEndFrame(21)

      const combined = new Uint8Array(
        jsonFrame.length + chunkFrame.length + endFrame.length,
      )
      combined.set(jsonFrame, 0)
      combined.set(chunkFrame, jsonFrame.length)
      combined.set(endFrame, jsonFrame.length + chunkFrame.length)

      const input = new ReadableStream<Uint8Array>({
        start(controller) {
          for (let i = 0; i < combined.length; i++) {
            controller.enqueue(combined.subarray(i, i + 1))
          }
          controller.close()
        },
      })

      const [jsonChunks, getOrCreateStream] = createFrameDecoder(input)
      const stream21 = getOrCreateStream(21)

      const jsonReader = jsonChunks.getReader()
      const { value: jsonValue } = await jsonReader.read()
      expect(jsonValue).toBe('{"ref":21}')

      const rawReader = stream21.getReader()
      const received: Array<number> = []
      for (;;) {
        const { done, value } = await rawReader.read()
        if (done) {
          break
        }
        received.push(...value)
      }
      expect(received).toEqual(Array.from(payload))
    })

    it('decodes many frames when reads never align with frame boundaries', async () => {
      // These 100-byte frames never align with the 7-byte input reads.
      const FRAME_COUNT = 7
      const expected: Array<string> = []
      const frames: Array<Uint8Array> = []
      for (let i = 0; i < FRAME_COUNT; i++) {
        const payload = `frame-${i}`.padEnd(91, '.') // 91 bytes => 100-byte frame
        expected.push(payload)
        frames.push(encodeJSONFrame(payload))
      }

      const totalLen = frames.reduce((acc, f) => acc + f.length, 0)
      const combined = new Uint8Array(totalLen)
      let offset = 0
      for (const f of frames) {
        combined.set(f, offset)
        offset += f.length
      }

      const input = new ReadableStream<Uint8Array>({
        start(controller) {
          for (let i = 0; i < combined.length; i += 7) {
            controller.enqueue(combined.subarray(i, i + 7))
          }
          controller.close()
        },
      })

      const [jsonChunks] = createFrameDecoder(input)
      const reader = jsonChunks.getReader()
      const received: Array<string> = []
      for (;;) {
        const { done, value } = await reader.read()
        if (done) {
          break
        }
        received.push(value)
      }
      expect(received).toEqual(expected)
    })
  })
})
