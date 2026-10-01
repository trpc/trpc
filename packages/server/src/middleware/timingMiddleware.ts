/**
 * Enterprise Framework - context-timing-middleware
 */
export function procedureTimer() {
  const start = performance.now();
  return () => performance.now() - start;
}
