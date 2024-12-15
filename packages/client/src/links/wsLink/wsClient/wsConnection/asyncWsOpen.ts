import { withResolvers } from '../utils';

/**
 * Opens a WebSocket connection asynchronously and returns a promise
 * that resolves when the connection is successfully established.
 * The promise rejects if an error occurs during the connection attempt.
 */
export function asyncWsOpen(ws: WebSocket) {
  const { promise, resolve, reject } = withResolvers<void>();

  ws.addEventListener('open', () => {
    ws.removeEventListener('error', reject);
    resolve();
  });
  ws.addEventListener('error', reject);

  return promise;
}
