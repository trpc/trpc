import { createPlugin } from 'seroval'
import { RawStream } from './RawStream'
import type { OnRawStreamCallback, RawStreamRPCNode } from './RawStream'

/**
 * Server-side RawStream plugin for multiplexed server-function responses.
 * The `hint` is ignored: framed responses always carry raw bytes.
 */
/* @__NO_SIDE_EFFECTS__ */
export function createRawStreamRPCPlugin(onRawStream: OnRawStreamCallback) {
  let nextStreamId = 1

  return /* @__PURE__ */ createPlugin<RawStream, RawStreamRPCNode>({
    tag: 'tss/RawStream',
    test(value: unknown) {
      return value instanceof RawStream
    },
    parse: {
      stream(value, ctx) {
        const streamId = nextStreamId++
        onRawStream(streamId, value.stream)
        return { streamId: ctx.parse(streamId) }
      },
    },
    serialize: undefined as never,
    deserialize: undefined as never,
  })
}

/** Client-side RawStream plugin for multiplexed server-function responses. */
/* @__NO_SIDE_EFFECTS__ */
export function createRawStreamDeserializePlugin(
  getStream: (id: number) => ReadableStream<Uint8Array>,
) {
  return /* @__PURE__ */ createPlugin<
    ReadableStream<Uint8Array>,
    RawStreamRPCNode
  >({
    tag: 'tss/RawStream',
    test: () => false,
    parse: {},
    serialize: undefined as never,
    deserialize(node, ctx) {
      return getStream(ctx.deserialize<number>(node.streamId))
    },
  })
}
