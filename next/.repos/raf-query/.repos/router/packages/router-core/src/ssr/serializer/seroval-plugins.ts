import { ReadableStreamPlugin } from 'seroval-plugins/web'
import { ShallowErrorPlugin } from './ShallowErrorPlugin'
import {
  RawStreamJSONDeserializePlugin,
  RawStreamJSONPlugin,
  createRawStreamJSONPlugin,
} from './RawStreamJSONPlugin'
import type { Plugin } from 'seroval'

/**
 * Plugins for JSON transport from a client: serializes RawStream arguments
 * and reads plain JSON responses, which never carry RawStream nodes.
 */
/* @__NO_SIDE_EFFECTS__ */
export function createDefaultSerovalPlugins(
  signal?: AbortSignal,
): Array<Plugin<any, any>> {
  return [
    ShallowErrorPlugin,
    signal ? createRawStreamJSONPlugin(signal) : RawStreamJSONPlugin,
    ReadableStreamPlugin,
  ]
}

export const defaultSerovalPlugins =
  /* @__PURE__ */ createDefaultSerovalPlugins()

/**
 * `defaultSerovalPlugins` plus RawStream deserialization, for JSON that may
 * carry RawStream nodes: server-function request bodies and cached static
 * responses. Seroval deserializes by first tag match, so the deserialize half
 * precedes the serialize half; it never matches during serialization.
 */
export const defaultSerovalDeserializerPlugins: Array<Plugin<any, any>> = [
  RawStreamJSONDeserializePlugin,
  ...defaultSerovalPlugins,
]
