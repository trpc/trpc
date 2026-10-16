import { createPlugin } from 'seroval'
import type { AdapterNode, AnySerializationAdapter } from './transformer'
import type { Plugin } from 'seroval'

/** Create a Seroval plugin for client/server symmetric (de)serialization. */
/* @__NO_SIDE_EFFECTS__ */
export function makeSerovalPlugin(
  serializationAdapter: AnySerializationAdapter,
): Plugin<any, AdapterNode> {
  return /* @__PURE__ */ createPlugin<any, AdapterNode>({
    tag: '$TSR/t/' + serializationAdapter.key,
    test: serializationAdapter.test,
    parse: {
      sync(value, ctx) {
        return { v: ctx.parse(serializationAdapter.toSerializable(value)) }
      },
      async async(value, ctx) {
        return {
          v: await ctx.parse(serializationAdapter.toSerializable(value)),
        }
      },
      stream(value, ctx) {
        return { v: ctx.parse(serializationAdapter.toSerializable(value)) }
      },
    },
    serialize: undefined as never,
    deserialize(node, ctx) {
      return serializationAdapter.fromSerializable(ctx.deserialize(node.v))
    },
  })
}
