/** @internal */
export const sqlCleanupBatchSize = 1000

/**
 * Key prefix for a persistence store. The store id is escaped so the namespace
 * always ends at its first `:`, and distinct store / key pairs never collide.
 *
 * @internal
 */
export const storeNamespace = (storeId: string): string => `${storeId.replace(/%/g, "%25").replace(/:/g, "%3A")}:`

/** @internal */
export const escapeRedisGlob = (pattern: string): string => pattern.replace(/[\\*?[\]]/g, "\\$&")
