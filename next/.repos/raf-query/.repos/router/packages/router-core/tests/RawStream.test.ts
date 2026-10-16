import { describe, expect, it, vi } from 'vitest'
import {
  createStream,
  crossSerializeStream,
  toCrossJSONAsync,
  toCrossJSONStream,
  fromCrossJSON,
} from 'seroval'
import type { SerovalNode } from 'seroval'
import { RawStream } from '../src/ssr/serializer/RawStream'
import {
  RawStreamJSONDeserializePlugin,
  RawStreamJSONPlugin,
  createRawStreamJSONPlugin,
} from '../src/ssr/serializer/RawStreamJSONPlugin'
import {
  createRawStreamDeserializePlugin,
  createRawStreamRPCPlugin,
} from '../src/ssr/serializer/RawStreamRPCPlugin'
import { RawStreamSSRPlugin } from '../src/ssr/serializer/RawStreamSSRPlugin'
import {
  defaultSerovalDeserializerPlugins,
  defaultSerovalPlugins,
} from '../src/ssr/serializer/seroval-plugins'

type EncodedStream = ReturnType<typeof createStream<any>>
type EncodedStreamListener = Parameters<EncodedStream['on']>[0]
type RawStreamFactory = (stream: EncodedStream) => ReadableStream<Uint8Array>

function getRawStreamFactory(
  pluginIndex: number,
  emitted: boolean,
): RawStreamFactory {
  if (emitted) {
    const plugin = RawStreamSSRPlugin.extends![pluginIndex]!
    const source = (plugin.serialize as () => string)()
    return new Function(`return ${source}`)() as RawStreamFactory
  }

  return (stream) => {
    const textNode = {} as SerovalNode
    const streamNode = {} as SerovalNode
    return (RawStreamJSONDeserializePlugin.deserialize as any)(
      { text: textNode, stream: streamNode },
      {
        deserialize(node: SerovalNode) {
          return node === textNode ? pluginIndex === 1 : stream
        },
      },
    )
  }
}

function createTrackedEncodedStream() {
  const listeners = new Set<EncodedStreamListener>()
  let unsubscribeCalls = 0
  const stream: EncodedStream = {
    __SEROVAL_STREAM__: true,
    on(listener) {
      listeners.add(listener)
      let subscribed = true
      return () => {
        if (subscribed) {
          subscribed = false
          unsubscribeCalls++
          listeners.delete(listener)
        }
      }
    },
    next(value) {
      for (const listener of listeners) {
        listener.next(value)
      }
    },
    throw(value) {
      for (const listener of listeners) {
        listener.throw(value)
      }
      listeners.clear()
    },
    return(value) {
      for (const listener of listeners) {
        listener.return(value)
      }
      listeners.clear()
    },
  }
  return {
    stream,
    get listenerCount() {
      return listeners.size
    },
    get unsubscribeCalls() {
      return unsubscribeCalls
    },
  }
}

describe('RawStream', () => {
  describe('RawStream class', () => {
    it('should wrap a ReadableStream<Uint8Array>', () => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]))
          controller.close()
        },
      })
      const rawStream = new RawStream(stream)
      expect(rawStream.stream).toBe(stream)
    })

    it('should be an instance of RawStream', () => {
      const stream = new ReadableStream<Uint8Array>()
      const rawStream = new RawStream(stream)
      expect(rawStream instanceof RawStream).toBe(true)
    })

    it('should default to binary hint', () => {
      const stream = new ReadableStream<Uint8Array>()
      const rawStream = new RawStream(stream)
      expect(rawStream.hint).toBe('binary')
    })

    it('should accept binary hint option', () => {
      const stream = new ReadableStream<Uint8Array>()
      const rawStream = new RawStream(stream, { hint: 'binary' })
      expect(rawStream.hint).toBe('binary')
    })

    it('should accept text hint option', () => {
      const stream = new ReadableStream<Uint8Array>()
      const rawStream = new RawStream(stream, { hint: 'text' })
      expect(rawStream.hint).toBe('text')
    })
  })

  describe('createRawStreamRPCPlugin', () => {
    it('should call onRawStream callback with stream id and stream', () => {
      const collectedStreams = new Map<number, ReadableStream<Uint8Array>>()

      const plugin = createRawStreamRPCPlugin((id, stream) => {
        collectedStreams.set(id, stream)
      })

      const testStream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]))
          controller.close()
        },
      })

      const rawStream = new RawStream(testStream)

      toCrossJSONStream(rawStream, {
        refs: new Map(),
        plugins: [plugin],
        onParse() {},
      })

      expect(collectedStreams.size).toBe(1)
      // Stream ID is assigned by our internal counter (sequential starting at 1)
      const streamEntry = Array.from(collectedStreams.entries())[0]
      expect(streamEntry).toBeDefined()
      expect(streamEntry![1]).toBe(testStream)
    })

    it('should serialize with tss/RawStream tag', () => {
      const plugin = createRawStreamRPCPlugin(() => {})

      const testStream = new ReadableStream<Uint8Array>()
      const rawStream = new RawStream(testStream)

      const serialized = new Array<unknown>()
      toCrossJSONStream(rawStream, {
        refs: new Map(),
        plugins: [plugin],
        onParse(value) {
          serialized.push(value)
        },
      })

      // The serialized output should have the plugin tag and contain streamId
      const jsonStr = JSON.stringify(serialized)
      expect(jsonStr).toContain('tss/RawStream')
      expect(jsonStr).toContain('streamId')
    })

    it('should collect multiple streams with unique ids', () => {
      const collectedStreams = new Map<number, ReadableStream<Uint8Array>>()

      const plugin = createRawStreamRPCPlugin((id, stream) => {
        collectedStreams.set(id, stream)
      })

      const stream1 = new ReadableStream<Uint8Array>()
      const stream2 = new ReadableStream<Uint8Array>()

      const data = {
        first: new RawStream(stream1),
        second: new RawStream(stream2),
      }

      toCrossJSONStream(data, {
        refs: new Map(),
        plugins: [plugin],
        onParse() {},
      })

      expect(collectedStreams.size).toBe(2)
      const ids = Array.from(collectedStreams.keys())
      expect(ids[0]).not.toBe(ids[1])
    })
  })

  describe('round-trip serialization', () => {
    it('does not acquire the source reader when hint parsing fails', async () => {
      const getReader = vi.fn()
      const stream = { getReader } as unknown as ReadableStream<Uint8Array>
      const failure = new Error('hint parse failed')
      const parse = RawStreamJSONPlugin.parse.async! as any

      await expect(
        parse(new RawStream(stream), {
          parse: () => Promise.reject(failure),
        }),
      ).rejects.toBe(failure)
      expect(getReader).not.toHaveBeenCalled()
    })

    it('does not acquire the source reader when request serialization is already aborted', async () => {
      const getReader = vi.fn()
      const stream = { getReader } as unknown as ReadableStream<Uint8Array>
      const controller = new AbortController()
      const reason = new Error('request aborted')
      controller.abort(reason)

      await expect(
        toCrossJSONAsync(new RawStream(stream), {
          refs: new Map(),
          plugins: [createRawStreamJSONPlugin(controller.signal)],
        }),
      ).rejects.toMatchObject({ cause: reason })
      expect(getReader).not.toHaveBeenCalled()
    })

    it('preserves malformed UTF-8 and BOM bytes in text chunks', async () => {
      const cancel = vi.fn()
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(Uint8Array.of(0x41, 0xe2))
          controller.enqueue(Uint8Array.of(0x28))
          controller.enqueue(Uint8Array.of(0xef, 0xbb, 0xbf, 0x42))
          controller.close()
        },
        cancel,
      })

      const serialized = await new Promise<Array<string>>((resolve, reject) => {
        const sources = new Array<string>()
        crossSerializeStream(new RawStream(stream, { hint: 'text' }), {
          refs: new Map(),
          plugins: [RawStreamSSRPlugin],
          scopeId: 'raw-stream-test',
          onSerialize(source) {
            sources.push(source)
          },
          onError: reject,
          onDone() {
            expect(stream.locked).toBe(false)
            resolve(sources)
          },
        })
      })

      const output = serialized.join(';')
      expect(output).toContain('QeI=')
      expect(output).toContain('\ufeffB')
      expect(cancel).not.toHaveBeenCalled()
      expect(stream.locked).toBe(false)
    })

    it('preserves a UTF-8 character split across text chunks', async () => {
      // Each half is invalid UTF-8 by itself. Text mode must encode both as
      // binary instead of retaining decoder state across chunk boundaries.
      const expected = [Uint8Array.of(0xf0, 0x9f), Uint8Array.of(0x98, 0x80)]
      const input = new ReadableStream<Uint8Array>({
        start(controller) {
          for (const chunk of expected) {
            controller.enqueue(chunk)
          }
          controller.close()
        },
      })

      const serialized = await toCrossJSONAsync(
        new RawStream(input, { hint: 'text' }),
        {
          refs: new Map(),
          plugins: [RawStreamJSONPlugin],
        },
      )
      const output = fromCrossJSON(serialized, {
        refs: new Map(),
        plugins: [RawStreamJSONDeserializePlugin],
      }) as ReadableStream<Uint8Array>
      const reader = output.getReader()

      await expect(reader.read()).resolves.toEqual({
        done: false,
        value: expected[0],
      })
      await expect(reader.read()).resolves.toEqual({
        done: false,
        value: expected[1],
      })
      await expect(reader.read()).resolves.toEqual({
        done: true,
        value: undefined,
      })
    })

    it.each([
      ['default', 'binary', defaultSerovalDeserializerPlugins],
      ['default', 'text', defaultSerovalDeserializerPlugins],
      ['deserialize-only', 'binary', [RawStreamJSONDeserializePlugin]],
      ['deserialize-only', 'text', [RawStreamJSONDeserializePlugin]],
    ] as const)(
      'preserves every %s-plugin decoded %s-hinted chunk through async JSON',
      async (_, hint, deserializePlugins) => {
        const expected = [
          new Uint8Array(),
          Uint8Array.of(0x41, 0x42),
          Uint8Array.of(0x41, 0xe2),
          Uint8Array.of(0xef, 0xbb, 0xbf, 0x42),
        ]
        const input = new ReadableStream<Uint8Array>({
          start(controller) {
            for (const chunk of expected) {
              controller.enqueue(chunk)
            }
            controller.close()
          },
        })

        const serialized = await toCrossJSONAsync(
          new RawStream(input, { hint }),
          {
            refs: new Map(),
            plugins: [RawStreamJSONPlugin],
          },
        )
        const output = fromCrossJSON(serialized, {
          refs: new Map(),
          plugins: [...deserializePlugins],
        }) as ReadableStream<Uint8Array>
        const reader = output.getReader()
        const actual: Array<Uint8Array> = []

        while (true) {
          const next = await reader.read()
          if (next.done) {
            break
          }
          actual.push(next.value)
        }

        expect(actual.map((chunk) => Array.from(chunk))).toEqual(
          expected.map((chunk) => Array.from(chunk)),
        )
      },
    )

    it('round-trips: client default plugins write, deserializer plugins read', async () => {
      const input = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(Uint8Array.of(1, 2, 3))
          controller.close()
        },
      })
      const serialized = await toCrossJSONAsync(
        { stream: new RawStream(input), error: new Error('boom') },
        { refs: new Map(), plugins: defaultSerovalPlugins },
      )
      const output = fromCrossJSON(serialized, {
        refs: new Map(),
        plugins: defaultSerovalDeserializerPlugins,
      }) as { stream: ReadableStream<Uint8Array>; error: Error }

      expect(output.error).toBeInstanceOf(Error)
      expect(output.error.message).toBe('boom')
      const reader = output.stream.getReader()
      await expect(reader.read()).resolves.toEqual({
        done: false,
        value: Uint8Array.of(1, 2, 3),
      })
      await expect(reader.read()).resolves.toMatchObject({ done: true })
    })

    it('should serialize and deserialize RawStream correctly', async () => {
      // Collect streams during serialization
      const collectedStreams = new Map<number, ReadableStream<Uint8Array>>()
      const rpcPlugin = createRawStreamRPCPlugin((id, stream) => {
        collectedStreams.set(id, stream)
      })

      const testStream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]))
          controller.close()
        },
      })

      const data = {
        message: 'test',
        rawData: new RawStream(testStream),
      }

      // Serialize using RPC plugin
      const refs = new Map()
      let serialized: SerovalNode | undefined
      toCrossJSONStream(data, {
        refs,
        plugins: [rpcPlugin],
        onParse(value) {
          serialized = value
        },
      })

      // Verify we collected the stream
      expect(collectedStreams.size).toBe(1)
      const streamId = Array.from(collectedStreams.keys())[0]!

      // Create getOrCreateStream function
      const getOrCreateStream = (id: number) => {
        const stream = collectedStreams.get(id)
        if (!stream) {
          throw new Error(`Stream ${id} not found in collected streams`)
        }
        return stream
      }

      // Create deserialize plugin with function
      const deserializePlugin =
        createRawStreamDeserializePlugin(getOrCreateStream)

      // Deserialize
      const deserialized = fromCrossJSON(serialized!, {
        refs: new Map(),
        plugins: [deserializePlugin],
      }) as any

      expect(deserialized.message).toBe('test')
      expect(deserialized.rawData).toBe(testStream)
    })
  })

  describe('SSR stream lifecycle', () => {
    it.each(['chunk', 'eof', 'error'] as const)(
      'ignores a late %s read result after disposal',
      async (settlement) => {
        let resolveRead!: (result: ReadableStreamReadResult<Uint8Array>) => void
        let rejectRead!: (error: unknown) => void
        const readResult = new Promise<ReadableStreamReadResult<Uint8Array>>(
          (resolve, reject) => {
            resolveRead = resolve
            rejectRead = reject
          },
        )
        const reader = {
          read: vi.fn(() => readResult),
          cancel: vi.fn(() => Promise.resolve()),
          releaseLock: vi.fn(),
        }
        const readable = {
          getReader: () => reader,
        } as unknown as ReadableStream<Uint8Array>
        const sources = new Array<string>()
        const dispose = crossSerializeStream(new RawStream(readable), {
          refs: new Map(),
          plugins: [RawStreamSSRPlugin],
          scopeId: 'raw-stream-disposal-test',
          onSerialize(source) {
            sources.push(source)
          },
        })

        expect(reader.read).toHaveBeenCalledTimes(1)
        const sourceCount = sources.length
        dispose()
        dispose()
        expect(reader.cancel).toHaveBeenCalledTimes(1)
        expect(reader.releaseLock).toHaveBeenCalledTimes(1)

        if (settlement === 'error') {
          rejectRead(new Error('late read failure'))
        } else {
          resolveRead(
            settlement === 'eof'
              ? { done: true, value: undefined }
              : { done: false, value: Uint8Array.of(1) },
          )
        }
        await Promise.resolve()
        await Promise.resolve()

        expect(sources).toHaveLength(sourceCount)
        expect(reader.read).toHaveBeenCalledTimes(1)
        expect(reader.cancel).toHaveBeenCalledTimes(1)
        expect(reader.releaseLock).toHaveBeenCalledTimes(1)
      },
    )
  })

  describe.each([
    { hint: 'binary', pluginIndex: 0, encoded: 'QQ==' },
    { hint: 'text', pluginIndex: 1, encoded: 'tA' },
  ] as const)('$hint browser factory', ({ pluginIndex, encoded }) => {
    it.each([
      ['local', false],
      ['emitted', true],
    ] as const)(
      'unsubscribes the %s factory on cancellation',
      async (_, emitted) => {
        const factory = getRawStreamFactory(pluginIndex, emitted)
        const encodedStream = createTrackedEncodedStream()
        const output = factory(encodedStream.stream)
        const reader = output.getReader()

        expect(encodedStream.listenerCount).toBe(1)
        encodedStream.stream.next(encoded)
        const chunk = await reader.read()
        expect(chunk.done).toBe(false)
        expect(Array.from(chunk.value!)).toEqual([65])

        await reader.cancel()
        await reader.cancel()
        expect(encodedStream.unsubscribeCalls).toBe(1)
        expect(encodedStream.listenerCount).toBe(0)

        encodedStream.stream.next(encoded)
        expect(encodedStream.listenerCount).toBe(0)
      },
    )

    it.each([
      ['local', false],
      ['emitted', true],
    ] as const)(
      'does not retain a synchronous terminal disposer in the %s factory',
      async (_, emitted) => {
        const unsubscribe = vi.fn()
        const stream = {
          __SEROVAL_STREAM__: true,
          on(listener: EncodedStreamListener) {
            listener.next(encoded)
            listener.return(undefined)
            return unsubscribe
          },
          next() {},
          throw() {},
          return() {},
        } as EncodedStream
        const reader = getRawStreamFactory(
          pluginIndex,
          emitted,
        )(stream).getReader()

        expect(unsubscribe).toHaveBeenCalledTimes(emitted ? 0 : 1)
        await reader.cancel()
        expect(unsubscribe).toHaveBeenCalledTimes(emitted ? 0 : 1)
      },
    )

    it.each([false, true])(
      'disposes a malformed buffered JSON stream (ended: %s)',
      async (ended) => {
        const stream = createStream<string | undefined>()
        stream.next(pluginIndex === 1 ? 'b%' : '%')
        stream.next(encoded)
        if (ended) {
          stream.return(undefined)
        }
        const on = stream.on.bind(stream)
        const unsubscribe = vi.fn()
        vi.spyOn(stream, 'on').mockImplementation((listener) => {
          unsubscribe.mockImplementation(on(listener))
          return unsubscribe
        })

        const reader = getRawStreamFactory(
          pluginIndex,
          false,
        )(stream).getReader()

        expect(unsubscribe).toHaveBeenCalledOnce()
        await expect(reader.read()).rejects.toMatchObject({
          name: 'InvalidCharacterError',
        })
        stream.next(encoded)
        await expect(reader.cancel()).rejects.toMatchObject({
          name: 'InvalidCharacterError',
        })
        expect(unsubscribe).toHaveBeenCalledOnce()
        reader.releaseLock()
      },
    )

    it.each([
      ['local', false],
      ['emitted', true],
    ] as const)(
      'does not retain a live terminal disposer in the %s factory',
      async (_, emitted) => {
        const encodedStream = createTrackedEncodedStream()
        const reader = getRawStreamFactory(
          pluginIndex,
          emitted,
        )(encodedStream.stream).getReader()

        encodedStream.stream.next(encoded)
        encodedStream.stream.return(undefined)
        await reader.cancel()

        expect(encodedStream.unsubscribeCalls).toBe(0)
      },
    )
  })
})
