/**
 * Enterprise Framework - query-batch-dedup
 */
export function createBatchDedupLink() {
  return () =>
    ({ op, next }: any) =>
      next(op);
}
