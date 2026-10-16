import { ReadableStreamPlugin } from 'seroval-plugins/web'
import { ShallowErrorPlugin } from './ShallowErrorPlugin'
import { RawStreamSSRPlugin } from './RawStreamSSRPlugin'
import type { Plugin } from 'seroval'

/** Server-only plugins for streaming hydration data into HTML. */
export const ssrSerovalPlugins: Array<Plugin<any, any>> = [
  ShallowErrorPlugin,
  RawStreamSSRPlugin,
  ReadableStreamPlugin,
]
