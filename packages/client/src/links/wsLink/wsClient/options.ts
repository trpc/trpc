import type { UrlOptionsWithConnectionParams } from '../../internals/urlWithConnectionParams';

export interface WebSocketClientOptions extends UrlOptionsWithConnectionParams {
  /**
   * Ponyfill which WebSocket implementation to use
   */
  WebSocket?: typeof WebSocket;
  /**
   * The number of milliseconds before a reconnect is attempted.
   * @default {@link exponentialBackoff}
   */
  retryDelayMs?: (attemptIndex: number) => number;
  /**
   * Triggered when a WebSocket connection is established
   */
  onOpen?: () => void;
  /**
   * Triggered when a WebSocket connection encounters an error
   */
  onError?: (evt?: Event) => void;
  /**
   * Triggered when a WebSocket connection is closed
   */
  onClose?: (cause?: { code?: number }) => void;
  /**
   * Lazy mode will close the WebSocket automatically after a period of inactivity (no messages sent or received and no pending requests)
   */
  lazy?: {
    /**
     * Enable lazy mode
     * @default false
     */
    enabled: boolean;
    /**
     * Close the WebSocket after this many milliseconds
     * @default 0
     */
    closeMs: number;
  };
  /**
   * Send ping messages to the server and kill the connection if no pong message is returned
   */
  keepAlive?: {
    /**
     * @default false
     */
    enabled: boolean;
    /**
     * Send a ping message every this many milliseconds
     * @default 5_000
     */
    intervalMs?: number;
    /**
     * Close the WebSocket after this many milliseconds if the server does not respond
     * @default 1_000
     */
    pongTimeoutMs?: number;
  };
}

/**
 * Default options for lazy WebSocket connections.
 * Determines whether the connection should be established lazily and defines the delay before closure.
 */
export type LazyOptions = Required<NonNullable<WebSocketClientOptions['lazy']>>;
export const lazyDefaults: LazyOptions = {
  enabled: false,
  closeMs: 0,
};

/**
 * Default options for the WebSocket keep-alive mechanism.
 * Configures whether keep-alive is enabled and specifies the timeout and interval for ping-pong messages.
 */
export type KeepAliveOptions = Required<
  NonNullable<WebSocketClientOptions['keepAlive']>
>;
export const keepAliveDefaults: KeepAliveOptions = {
  enabled: false,
  pongTimeoutMs: 1_000,
  intervalMs: 5_000,
};

/**
 * Calculates a delay for exponential backoff based on the retry attempt index.
 * The delay starts at 0 for the first attempt and doubles for each subsequent attempt,
 * capped at 30 seconds.
 */
export const exponentialBackoff = (attemptIndex: number) => {
  return attemptIndex === 0 ? 0 : Math.min(1000 * 2 ** attemptIndex, 30000);
};
