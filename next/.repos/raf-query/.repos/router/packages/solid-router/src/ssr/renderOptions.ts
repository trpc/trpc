import { makeSsrSerovalPlugin } from '@tanstack/router-core/ssr/server'
import type { renderToStream } from 'solid-js/web'
import type { AnyRouter, AnySerializationAdapter } from '@tanstack/router-core'

// Adapters are module-level singletons, so their SSR plugins are cached per
// adapter rather than rebuilt for every request.
const pluginCache = new WeakMap<
  AnySerializationAdapter,
  ReturnType<typeof makeSsrSerovalPlugin>
>()

function getPlugin(adapter: AnySerializationAdapter) {
  let plugin = pluginCache.get(adapter)
  if (!plugin) {
    plugin = makeSsrSerovalPlugin(adapter)
    pluginCache.set(adapter, plugin)
  }
  return plugin
}

/** Solid renderer options shared by the stream and string paths. */
export function getSolidRenderOptions(router: AnyRouter) {
  return {
    nonce: router.options.ssr?.nonce,
    // `plugins` is honoured by Solid's server runtime but absent from its
    // public option type.
    plugins: router.options.serializationAdapters?.map(getPlugin),
  } as Parameters<typeof renderToStream>[1]
}
