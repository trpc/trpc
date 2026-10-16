import { createPlugin } from 'seroval'
import { GLOBAL_TSR } from '../constants'
import type { AdapterNode, AnySerializationAdapter } from './transformer'
import type { Plugin } from 'seroval'

/**
 * Create a Seroval plugin for server-side serialization only. `tracker.didRun`
 * becomes true once the plugin serialized a value.
 */
/* @__NO_SIDE_EFFECTS__ */
export function makeSsrSerovalPlugin(
  serializationAdapter: AnySerializationAdapter,
  tracker?: { didRun: boolean },
): Plugin<any, AdapterNode> {
  return /* @__PURE__ */ createPlugin<any, AdapterNode>({
    tag: '$TSR/t/' + serializationAdapter.key,
    test: serializationAdapter.test,
    parse: {
      stream(value, ctx) {
        return {
          v: ctx.parse(serializationAdapter.toSerializable(value)),
        }
      },
    },
    serialize(node, ctx) {
      if (tracker) {
        tracker.didRun = true
      }
      return (
        GLOBAL_TSR +
        '.t.get("' +
        serializationAdapter.key +
        '")(' +
        ctx.serialize(node.v) +
        ')'
      )
    },
    deserialize: undefined as never,
  })
}
