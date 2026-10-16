/**
 * Declares the wa-sqlite IndexedDB batch-atomic VFS example module.
 *
 * @since 4.0.0
 */
declare module "@effect/wa-sqlite/src/examples/IDBBatchAtomicVFS.js" {
  /**
   * IndexedDB-backed wa-sqlite virtual file system that batches writes and
   * commits them atomically.
   *
   * @category models
   * @since 4.0.0
   */
  // oxlint-disable-next-line @typescript-eslint/no-extraneous-class
  export class IDBBatchAtomicVFS {
    /**
     * Creates a batch-atomic IndexedDB VFS registered under `name` for the
     * provided wa-sqlite module. The optional `options` value is forwarded to
     * the upstream VFS implementation.
     */
    static async create(name: string, module: any, options?: any): Promise<any>
  }
}

/**
 * Declares the wa-sqlite OPFS access-handle pool VFS example module.
 *
 * @since 4.0.0
 */
declare module "@effect/wa-sqlite/src/examples/AccessHandlePoolVFS.js" {
  /**
   * OPFS-backed wa-sqlite virtual file system that pools file-system access
   * handles for persistent browser storage.
   *
   * @category models
   * @since 4.0.0
   */
  // oxlint-disable-next-line @typescript-eslint/no-extraneous-class
  export class AccessHandlePoolVFS {
    /**
     * Creates an OPFS access-handle pool VFS registered under `name` for the
     * provided wa-sqlite module. The optional `options` value is forwarded to
     * the upstream VFS implementation.
     */
    static async create(name: string, module: any, options?: any): Promise<any>
  }
}
