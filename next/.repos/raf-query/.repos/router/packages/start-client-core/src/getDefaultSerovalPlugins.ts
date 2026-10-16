import {
  createDefaultSerovalPlugins,
  makeSerovalPlugin,
} from '@tanstack/router-core/ssr/client'
import { getStartOptions } from './getStartOptions'
import type { AnySerializationAdapter } from '@tanstack/router-core/ssr/client'
import type { Plugin } from 'seroval'

/** Start's serialization adapters followed by `routerPlugins`. */
export function getSerovalPlugins(
  routerPlugins: Array<Plugin<any, any>>,
): Array<Plugin<any, any>> {
  const adapters = getStartOptions()?.serializationAdapters as
    | Array<AnySerializationAdapter>
    | undefined
  return [...(adapters?.map(makeSerovalPlugin) ?? []), ...routerPlugins]
}

/**
 * Plugins for client JSON transport. The optional signal stops RawStream
 * pumps when the request is aborted.
 */
export function getDefaultSerovalPlugins(
  signal?: AbortSignal,
): Array<Plugin<any, any>> {
  return getSerovalPlugins(createDefaultSerovalPlugins(signal))
}
