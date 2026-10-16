import { createPlugin } from 'seroval'
import { RawStream } from './RawStream'
import {
  decodeText,
  encodeText,
  fromBase64,
  fromEncodedStream,
  pumpEncodedStream,
  toBase64,
} from './rawStreamCodec'
import type { createStream } from 'seroval'
import type { RawStreamJSONNode } from './RawStream'

/**
 * Serializes a RawStream into JSON requests and static-cache responses.
 * The optional signal stops the source pump when the request is aborted.
 */
/* @__NO_SIDE_EFFECTS__ */
export function createRawStreamJSONPlugin(signal?: AbortSignal) {
  return /* @__PURE__ */ createPlugin<RawStream, RawStreamJSONNode>({
    tag: 'tss/RawStream',
    test: (value) => value instanceof RawStream,
    parse: {
      async: async (value, ctx) => {
        // Parse the hint before touching the source so a failed parse never
        // locks the caller's stream.
        const text = await ctx.parse(value.hint === 'text')
        const [stream] = pumpEncodedStream(
          value.stream,
          value.hint === 'text' ? encodeText : toBase64,
          signal,
        )
        return { text, stream: await ctx.parse(stream) }
      },
    },
    serialize: undefined as never,
    deserialize: undefined as never,
  })
}

export const RawStreamJSONPlugin = /* @__PURE__ */ createRawStreamJSONPlugin()

/**
 * Deserializes the JSON shape above back into a `ReadableStream<Uint8Array>`.
 * `test` never matches, so this plugin is inert during serialization and can
 * share a plugin list with `RawStreamJSONPlugin`.
 */
export const RawStreamJSONDeserializePlugin = /* @__PURE__ */ createPlugin<
  ReadableStream<Uint8Array>,
  RawStreamJSONNode
>({
  tag: 'tss/RawStream',
  test: () => false,
  parse: {},
  serialize: undefined as never,
  deserialize(node, ctx) {
    return fromEncodedStream(
      ctx.deserialize<ReturnType<typeof createStream<string | undefined>>>(
        node.stream,
      ),
      ctx.deserialize<boolean>(node.text) ? decodeText : fromBase64,
    )
  },
})
