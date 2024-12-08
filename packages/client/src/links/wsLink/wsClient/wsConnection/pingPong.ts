export interface PingPongOptions {
  /**
   * The interval (in milliseconds) between "PING" messages.
   */
  intervalMs: number;

  /**
   * The timeout (in milliseconds) to wait for a "PONG" response before closing the connection.
   */
  pongTimeoutMs: number;
}

/**
 * Sets up a periodic ping-pong mechanism to keep the WebSocket connection alive.
 *
 * - Sends "PING" messages at regular intervals defined by `intervalMs`.
 * - If a "PONG" response is not received within the `pongTimeoutMs`, the WebSocket is closed.
 * - The ping timer resets upon receiving any message to maintain activity.
 * - Automatically starts the ping process when the WebSocket connection is opened.
 * - Cleans up timers when the WebSocket is closed.
 *
 * @param ws - The WebSocket instance to manage.
 * @param options - Configuration options for ping-pong intervals and timeouts.
 */
export function setupPingInterval(
  ws: WebSocket,
  { intervalMs, pongTimeoutMs }: PingPongOptions,
) {
  let pingTimeout: ReturnType<typeof setTimeout> | undefined;
  let pongTimeout: ReturnType<typeof setTimeout> | undefined;

  function start() {
    pingTimeout = setTimeout(() => {
      ws.send('PING');
      pongTimeout = setTimeout(() => {
        ws.close();
      }, pongTimeoutMs);
    }, intervalMs);
  }

  function reset() {
    clearTimeout(pingTimeout);
    start();
  }

  function pong() {
    clearTimeout(pongTimeout);
    reset();
  }

  ws.addEventListener('open', start);
  ws.addEventListener('message', ({ data }) => {
    clearTimeout(pingTimeout);
    start();

    if (data === 'PONG') {
      pong();
    }
  });
  ws.addEventListener('close', () => {
    clearTimeout(pingTimeout);
    clearTimeout(pongTimeout);
  });
}
