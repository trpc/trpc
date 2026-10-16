// @vitest-environment node

import { beforeEach, expect, test, vi } from 'vitest'
import { createStream, fromCrossJSON } from 'seroval'
import {
  TSS_CONTENT_TYPE_FRAMED_VERSIONED,
  X_TSS_SERIALIZED,
} from '@tanstack/start-client-core'
import {
  FRAME_HEADER_SIZE,
  FRAME_TYPE_CHUNK,
  FRAME_TYPE_JSON,
  MAX_FRAMED_STREAMS,
} from '@tanstack/start-client-core/client-rpc'
import { RawStream } from '@tanstack/router-core'
import { defaultSerovalDeserializerPlugins } from '@tanstack/router-core/ssr/server'
import { handleServerAction } from '../src/server-functions-handler'
import type * as StartClientCore from '@tanstack/start-client-core'

const mocks = vi.hoisted(() => ({
  action: vi.fn(),
  response: { status: 200, statusText: 'OK' },
}))

vi.mock('../src/getServerFnById', () => ({
  getServerFnById: () => mocks.action,
}))

vi.mock('../src/request-response', () => ({
  getResponse: () => mocks.response,
}))

vi.mock('@tanstack/start-client-core', async (importOriginal) => {
  const actual = await importOriginal<typeof StartClientCore>()
  const { defaultSerovalDeserializerPlugins } =
    await import('@tanstack/router-core/ssr/server')
  return {
    ...actual,
    getSerovalPlugins: () => defaultSerovalDeserializerPlugins,
  }
})

beforeEach(() => {
  mocks.action.mockReset()
  mocks.response.status = 200
  mocks.response.statusText = 'OK'
})

async function readFrames(response: Response) {
  const frames: Array<{ type: number; payload: Uint8Array }> = []
  const reader = response.body!.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) {
      return frames
    }
    frames.push({
      type: value[0]!,
      payload: value.slice(FRAME_HEADER_SIZE),
    })
  }
}

function expectRawReferenceBeforeChunk(
  frames: Array<{ type: number; payload: Uint8Array }>,
) {
  const chunkIndex = frames.findIndex(
    (frame) => frame.type === FRAME_TYPE_CHUNK,
  )
  const referenceIndex = frames.findIndex(
    (frame) =>
      frame.type === FRAME_TYPE_JSON &&
      new TextDecoder().decode(frame.payload).includes('tss/RawStream'),
  )
  expect(referenceIndex).toBeGreaterThanOrEqual(0)
  expect(chunkIndex).toBeGreaterThan(referenceIndex)
}

test.each([false, 0, '', null])(
  'preserves the direct server-function result %j',
  async (result) => {
    mocks.action.mockResolvedValue({ result })

    await expect(
      handleServerAction({
        request: new Request('http://localhost/_serverFn/test', {
          method: 'POST',
        }),
        context: {},
        serverFnId: 'test',
      }),
    ).resolves.toBe(result)
  },
)

test('serializes a complete direct JSON record without LF', async () => {
  mocks.action.mockResolvedValue({ result: { value: 'complete' } })

  const response = await handleServerAction({
    request: new Request('http://localhost/_serverFn/test', {
      method: 'POST',
      headers: { 'x-tsr-serverFn': 'true' },
    }),
    context: {},
    serverFnId: 'test',
  })

  const encoded = await response.text()
  const parsed = JSON.parse(encoded)
  expect(encoded).toBe(JSON.stringify(parsed))
  expect(encoded).not.toContain('\n')
})

test('cancelling a framed response disposes its serializer', async () => {
  const cancel = vi.fn()
  const source = new ReadableStream({
    cancel,
  })
  mocks.action.mockResolvedValue({ result: source })

  const response = await handleServerAction({
    request: new Request('http://localhost/_serverFn/test', {
      method: 'POST',
      headers: { 'x-tsr-serverFn': 'true' },
    }),
    context: {},
    serverFnId: 'test',
  })

  expect(source.locked).toBe(true)
  await response.body!.cancel('client disconnected')
  expect(cancel).toHaveBeenCalledOnce()
  expect(source.locked).toBe(false)
})

test('aborting the request disposes a handed-off framed response', async () => {
  const abortController = new AbortController()
  const reason = new Error('request aborted')
  const cancel = vi.fn()
  const source = new ReadableStream({ cancel })
  mocks.action.mockResolvedValue({ result: new RawStream(source) })

  const response = await handleServerAction({
    request: new Request('http://localhost/_serverFn/test', {
      method: 'POST',
      headers: { 'x-tsr-serverFn': 'true' },
      signal: abortController.signal,
    }),
    context: {},
    serverFnId: 'test',
  })

  await vi.waitFor(() => {
    expect(source.locked).toBe(true)
  })
  abortController.abort(reason)
  await vi.waitFor(() => {
    expect(cancel).toHaveBeenCalledOnce()
    expect(cancel).toHaveBeenCalledWith(reason)
    expect(source.locked).toBe(false)
  })
  await expect(response.body!.getReader().read()).rejects.toBe(reason)
})

test('cancels synchronous RawStreams without pulling when the request is already aborted', async () => {
  const abortController = new AbortController()
  const reason = new Error('request already aborted')
  abortController.abort(reason)
  const sources = Array.from({ length: 3 }, () => {
    const cancel = vi.fn(() => new Promise<void>(() => {}))
    const pull = vi.fn()
    const stream = new ReadableStream<Uint8Array>(
      { pull, cancel },
      { highWaterMark: 0 },
    )
    return { stream, pull, cancel }
  })
  mocks.action.mockResolvedValue({
    result: sources.map(({ stream }) => new RawStream(stream)),
  })

  const response = await handleServerAction({
    request: new Request('http://localhost/_serverFn/test', {
      method: 'POST',
      headers: { 'x-tsr-serverFn': 'true' },
      signal: abortController.signal,
    }),
    context: {},
    serverFnId: 'test',
  })

  await expect(response.body!.getReader().read()).rejects.toBe(reason)
  await new Promise((resolve) => setTimeout(resolve, 0))
  for (const { stream, pull, cancel } of sources) {
    expect(pull).not.toHaveBeenCalled()
    expect(cancel).toHaveBeenCalledExactlyOnceWith(reason)
    expect(stream.locked).toBe(false)
  }
})

test('bounds and cancels synchronous RawStreams when their response remains unread', async () => {
  const sources = Array.from({ length: 3 }, () => {
    const cancel = vi.fn()
    const pull = vi.fn(
      (controller: ReadableStreamDefaultController<Uint8Array>) => {
        controller.enqueue(new Uint8Array(64 * 1024))
      },
    )
    const stream = new ReadableStream<Uint8Array>(
      { pull, cancel },
      { highWaterMark: 0 },
    )
    return { stream, pull, cancel }
  })
  mocks.action.mockResolvedValue({
    result: sources.map(({ stream }) => new RawStream(stream)),
  })

  const response = await handleServerAction({
    request: new Request('http://localhost/_serverFn/test', {
      method: 'POST',
      headers: { 'x-tsr-serverFn': 'true' },
    }),
    context: {},
    serverFnId: 'test',
  })

  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(sources.map(({ pull }) => pull.mock.calls.length)).toEqual([1, 1, 1])
  const reason = new Error('client disconnected')
  await response.body!.cancel(reason)
  await new Promise((resolve) => setTimeout(resolve, 0))
  for (const { stream, pull, cancel } of sources) {
    expect(pull).toHaveBeenCalledOnce()
    expect(cancel).toHaveBeenCalledExactlyOnceWith(reason)
    expect(stream.locked).toBe(false)
  }
})

test('a synchronous serialization failure cancels registered raw streams', async () => {
  const cancel = vi.fn()
  const source = new ReadableStream<Uint8Array>({ cancel })
  mocks.action.mockResolvedValue({
    result: {
      raw: new RawStream(source),
      unsupported: () => {},
    },
  })
  const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {})
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

  try {
    const response = await handleServerAction({
      request: new Request('http://localhost/_serverFn/test', {
        method: 'POST',
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      context: {},
      serverFnId: 'test',
    })

    expect(cancel).toHaveBeenCalledOnce()
    expect(cancel).toHaveBeenCalledWith(expect.any(Error))
    expect(source.locked).toBe(false)
    expect(response.headers.get(X_TSS_SERIALIZED)).toBe('true')
    expect(response.headers.get('content-type')).toBe('application/json')
    expect(
      fromCrossJSON(await response.json(), {
        plugins: defaultSerovalDeserializerPlugins,
      }),
    ).toBeInstanceOf(Error)
  } finally {
    consoleInfo.mockRestore()
    consoleError.mockRestore()
  }
})

test('admits replayed nested RawStream references before their chunks', async () => {
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([1]))
      controller.close()
    },
  })
  const replayed = createStream<RawStream | undefined>()
  replayed.next(new RawStream(source))
  replayed.return(undefined)
  mocks.action.mockResolvedValue({ result: { replayed } })

  const response = await handleServerAction({
    request: new Request('http://localhost/_serverFn/test', {
      method: 'POST',
      headers: { 'x-tsr-serverFn': 'true' },
    }),
    context: {},
    serverFnId: 'test',
  })

  expectRawReferenceBeforeChunk(await readFrames(response))
})

test('frames every record from a synchronously replayed Seroval stream', async () => {
  const replayed = createStream<number | undefined>()
  replayed.next(1)
  replayed.return(undefined)
  mocks.action.mockResolvedValue({ result: { replayed } })

  const response = await handleServerAction({
    request: new Request('http://localhost/_serverFn/test', {
      method: 'POST',
      headers: { 'x-tsr-serverFn': 'true' },
    }),
    context: {},
    serverFnId: 'test',
  })

  expect(response.headers.get('content-type')).toBe(
    TSS_CONTENT_TYPE_FRAMED_VERSIONED,
  )
  const frames = await readFrames(response)
  expect(frames.every((frame) => frame.type === FRAME_TYPE_JSON)).toBe(true)
  expect(frames.length).toBeGreaterThan(1)

  const refs = new Map()
  let result: any
  for (let index = 0; index < frames.length; index++) {
    const encoded = new TextDecoder().decode(frames[index]!.payload)
    const parsed = JSON.parse(encoded)
    expect(encoded).toBe(JSON.stringify(parsed))
    expect(encoded).not.toContain('\n')
    const value = fromCrossJSON(parsed, {
      refs,
      plugins: defaultSerovalDeserializerPlugins,
    })
    if (index === 0) {
      result = value
    }
  }

  const events: Array<[string, unknown]> = []
  result.result.replayed.on({
    next(value: unknown) {
      events.push(['next', value])
    },
    throw(error: unknown) {
      events.push(['throw', error])
    },
    return(value: unknown) {
      events.push(['return', value])
    },
  })
  expect(events).toEqual([
    ['next', 1],
    ['return', undefined],
  ])
})

test('keeps work discovered after a transient synchronous completion', async () => {
  const replayed = createStream<undefined>()
  replayed.return(undefined)
  let resolveLate!: (value: RawStream) => void
  const late = new Promise<RawStream>((resolve) => {
    resolveLate = resolve
  })
  mocks.action.mockResolvedValue({ result: { replayed, late } })

  const response = await handleServerAction({
    request: new Request('http://localhost/_serverFn/test', {
      method: 'POST',
      headers: { 'x-tsr-serverFn': 'true' },
    }),
    context: {},
    serverFnId: 'test',
  })
  resolveLate(
    new RawStream(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1]))
          controller.close()
        },
      }),
    ),
  )

  expectRawReferenceBeforeChunk(await readFrames(response))
})

test('bounds synchronously replayed Seroval records before framing', async () => {
  const replayed = createStream<number | undefined>()
  for (let index = 0; index < 1025; index++) {
    replayed.next(index)
  }
  replayed.return(undefined)
  mocks.action.mockResolvedValue({ result: { replayed } })
  const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {})
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

  try {
    const response = await handleServerAction({
      request: new Request('http://localhost/_serverFn/test', {
        method: 'POST',
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      context: {},
      serverFnId: 'test',
    })

    const error = fromCrossJSON(await response.json(), {
      plugins: defaultSerovalDeserializerPlugins,
    })
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain('pending output limit')
  } finally {
    consoleInfo.mockRestore()
    consoleError.mockRestore()
  }
})

test('admits late RawStream references before their chunks', async () => {
  let resolveRawStream!: (value: RawStream) => void
  const lateRawStream = new Promise<RawStream>((resolve) => {
    resolveRawStream = resolve
  })
  mocks.action.mockResolvedValue({ result: { lateRawStream } })

  const response = await handleServerAction({
    request: new Request('http://localhost/_serverFn/test', {
      method: 'POST',
      headers: { 'x-tsr-serverFn': 'true' },
    }),
    context: {},
    serverFnId: 'test',
  })
  resolveRawStream(
    new RawStream(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([2]))
          controller.close()
        },
      }),
    ),
  )

  expectRawReferenceBeforeChunk(await readFrames(response))
})

test('rejects a non-ASCII JSON record larger than the wire limit', async () => {
  const cancel = vi.fn()
  const source = new ReadableStream<Uint8Array>({ cancel })
  // h3 leaves the status unset until a handler sets one.
  mocks.response.status = undefined as unknown as number
  mocks.action.mockResolvedValue({
    result: {
      // UTF-16 length is within the old limit, but UTF-8 is over 16 MiB.
      value: 'é'.repeat(8 * 1024 * 1024),
      raw: new RawStream(source),
    },
  })

  const response = await handleServerAction({
    request: new Request('http://localhost/_serverFn/test', {
      method: 'POST',
      headers: { 'x-tsr-serverFn': 'true' },
    }),
    context: {},
    serverFnId: 'test',
  })

  expect(cancel).toHaveBeenCalledOnce()
  expect(source.locked).toBe(false)
  // Nothing reached the client yet, so the whole call fails.
  expect(response.status).toBe(500)
  expect(response.headers.get('content-type')).toBe('application/json')
  expect(await response.text()).toContain('pending output limit')
})

test.each(['RawStream', 'ReadableStream'])(
  'cancels %s serialization when Response construction rejects it',
  async (kind) => {
    const cancel = vi.fn()
    const source = new ReadableStream<Uint8Array>({ cancel })
    mocks.response.status = 204
    mocks.response.statusText = 'No Content'
    mocks.action.mockResolvedValue({
      result: kind === 'RawStream' ? new RawStream(source) : source,
    })
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {})
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      const response = await handleServerAction({
        request: new Request('http://localhost/_serverFn/test', {
          method: 'POST',
          headers: { 'x-tsr-serverFn': 'true' },
        }),
        context: {},
        serverFnId: 'test',
      })

      expect(response.status).toBe(500)
      expect(response.statusText).toBe('')
      expect(cancel).toHaveBeenCalledOnce()
      expect(source.locked).toBe(false)
    } finally {
      consoleInfo.mockRestore()
      consoleError.mockRestore()
    }
  },
)

test('rejects excess RawStreams before starting their readers', async () => {
  let pullCount = 0
  let cancelCount = 0
  const sources = Array.from(
    { length: MAX_FRAMED_STREAMS + 1 },
    () =>
      new ReadableStream<Uint8Array>(
        {
          pull() {
            pullCount++
          },
          cancel() {
            cancelCount++
          },
        },
        { highWaterMark: 0 },
      ),
  )
  mocks.action.mockResolvedValue({
    result: sources.map((source) => new RawStream(source)),
  })
  const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {})
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

  try {
    const response = await handleServerAction({
      request: new Request('http://localhost/_serverFn/test', {
        method: 'POST',
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      context: {},
      serverFnId: 'test',
    })

    expect(response.headers.get('content-type')).toBe('application/json')
    expect(pullCount).toBe(0)
    expect(cancelCount).toBe(MAX_FRAMED_STREAMS + 1)
    expect(sources.every((source) => !source.locked)).toBe(true)
  } finally {
    consoleInfo.mockRestore()
    consoleError.mockRestore()
  }
})
