import type { AnyMetaPlugin } from '@orpc/contract'
import { resolveMetaPlugins } from '@orpc/contract'

/**
 * Resolve oRPC meta plugins into a plain meta object usable as tRPC meta.
 *
 * This simulates how oRPC builders apply meta plugins, so well-known plugins
 * like `openapi` from `@orpc/openapi` can be used with tRPC builders.
 *
 * @remarks
 * **Warning**: Chained tRPC `.meta` calls merge shallowly, so oRPC metadata merge logic
 * (e.g. accumulating openapi `tags`) only works within a single `toTRPCMeta` call.
 *
 * @example
 * ```ts
 * const example = t.procedure
 *   .meta(toTRPCMeta(openapi({ path: '/hello' })))
 *   .query(() => 'Hello, World!')
 *
 * const merged = t.procedure
 *   .meta({
 *     ...toTRPCMeta(
 *       openapi({ path: '/hello' }),
 *       openapi({ method: 'POST' }),
 *     ),
 *     other: 'value',
 *   })
 *   .mutation(() => 'Hello, World!')
 * ```
 *
 * @see {@link https://orpc.dev/docs/integrations/trpc | tRPC Integration}
 */
export function toTRPCMeta(...plugins: AnyMetaPlugin[]): Record<string, any> {
  const [meta] = resolveMetaPlugins({}, undefined, plugins)
  return meta
}
