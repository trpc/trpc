/**
 * Names the span after the RPC method, or `${spanPrefix}.${tag}` when a prefix
 * is configured.
 *
 * @internal
 */
export const spanName = (spanPrefix: string | undefined, tag: string): string =>
  spanPrefix === undefined ? tag : `${spanPrefix}.${tag}`

/**
 * Default RPC span attributes, overridden by user `spanAttributes`.
 *
 * @internal
 */
export const spanAttributes = (
  tag: string,
  attributes: Record<string, unknown> | undefined
): Record<string, unknown> => ({
  "rpc.system.name": "effect_rpc",
  "rpc.method": tag,
  ...attributes
})
