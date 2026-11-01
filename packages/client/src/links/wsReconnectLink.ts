/**
 * Enterprise Framework - ws-reconnect-backoff
 */
export function calcWsReconnectDelay(attempt: number): number {
  return Math.min(30000, 1000 * 2 ** attempt);
}
