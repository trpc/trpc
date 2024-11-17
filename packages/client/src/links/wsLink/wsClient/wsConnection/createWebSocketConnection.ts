import { withResolvers } from '../utils';

/**
 * Opens a WebSocket connection asynchronously and returns a promise
 * that resolves when the connection is successfully established.
 * The promise rejects if an error occurs during the connection attempt.
 */
function asyncOpen(ws: WebSocket) {
  const { promise, resolve, reject } = withResolvers<void>();

  ws.addEventListener('open', () => {
    ws.removeEventListener('error', reject);
    resolve();
  });
  ws.addEventListener('error', reject);

  return promise;
}

/**
 * Creates a WebSocket connection from a URL promise and provides a structure
 * containing the WebSocket instance and its associated connection promise.
 *
 * @returns An object containing:
 *   - `wsPromise`: A promise resolving to the WebSocket instance.
 *   - `openPromise`: A promise resolving when the WebSocket connection is successfully opened.
 */
export function createWebSocketConnection(
  urlPromise: Promise<string>,
  WebSocketPonyfill = WebSocket,
) {
  const wsPromise = urlPromise.then((url) => new WebSocketPonyfill(url));

  return {
    wsPromise,
    openPromise: Promise.resolve(wsPromise).then(asyncOpen),
  };
}
