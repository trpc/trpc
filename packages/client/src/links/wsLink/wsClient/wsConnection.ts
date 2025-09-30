import { behaviorSubject } from '@trpc/server/observable';
import { run } from '@trpc/server/unstable-core-do-not-import';
import type { UrlOptionsWithConnectionParams } from '../../internals/urlWithConnectionParams';
import { buildConnectionMessage, prepareUrl } from './utils';

interface PingPongOptions {
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
function setupPingInterval(
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

export interface WebSocketConnectionOptions {
  WebSocketPonyfill?: typeof WebSocket;
  urlOptions: UrlOptionsWithConnectionParams;
  keepAlive: PingPongOptions & {
    enabled: boolean;
  };
}

/**
 * Manages a WebSocket connection with support for reconnection, keep-alive mechanisms,
 * and observable state tracking.
 */
export class WsConnection {
  private static connectCount = 0;
  public id = WsConnection.connectCount;

  private readonly WebSocketPonyfill: typeof WebSocket;
  private readonly urlOptions: UrlOptionsWithConnectionParams;
  private readonly keepAliveOpts: WebSocketConnectionOptions['keepAlive'];
  public readonly wsObservable = behaviorSubject<WebSocket | null>(null);

  constructor(opts: WebSocketConnectionOptions) {
    this.WebSocketPonyfill = opts.WebSocketPonyfill ?? WebSocket;
    if (!this.WebSocketPonyfill) {
      throw new Error(
        "No WebSocket implementation found - you probably don't want to use this on the server, but if you do you need to pass a `WebSocket`-ponyfill",
      );
    }

    this.urlOptions = opts.urlOptions;
    this.keepAliveOpts = opts.keepAlive;
  }

  public get ws() {
    return this.wsObservable.get();
  }

  private set ws(ws) {
    this.wsObservable.next(ws);
  }

  /**
   * Checks if the WebSocket connection is open and ready to communicate.
   */
  public isOpen(): this is { ws: WebSocket } {
    return (
      !!this.ws &&
      this.ws.readyState === this.WebSocketPonyfill.OPEN &&
      !this.openPromise
    );
  }

  /**
   * Checks if the WebSocket connection is closed or in the process of closing.
   */
  public isClosed(): this is { ws: WebSocket } {
    return (
      !!this.ws &&
      (this.ws.readyState === this.WebSocketPonyfill.CLOSING ||
        this.ws.readyState === this.WebSocketPonyfill.CLOSED)
    );
  }

  /**
   * Manages the WebSocket opening process, ensuring that only one open operation
   * occurs at a time. Tracks the ongoing operation with `openPromise` to avoid
   * redundant calls and ensure proper synchronization.
   *
   * Sets up the keep-alive mechanism and necessary event listeners for the connection.
   *
   * @returns A promise that resolves once the WebSocket connection is successfully opened.
   */
  private openPromise: Promise<void> | null = null;
  public async open() {
    if (this.openPromise) return this.openPromise;

    const id = ++WsConnection.connectCount;
    this.id = id;

    this.openPromise = run(async () => {
      const url = await prepareUrl(this.urlOptions);
      const ws = new this.WebSocketPonyfill(url);
      this.ws = ws;

      // Setup ping listener
      ws.addEventListener('message', (e) => {
        if (e.data === 'PING') {
          ws.send('PONG');
        }
      });

      if (this.keepAliveOpts.enabled) {
        setupPingInterval(ws, this.keepAliveOpts);
      }

      ws.addEventListener('close', () => {
        if (this.ws === ws) {
          this.ws = null;
        }
      });

      await new Promise<void>((resolve, reject) => {
        function cleanup() {
          ws.removeEventListener('open', onOpen);
          ws.removeEventListener('error', onError);
        }
        function onOpen() {
          cleanup();
          resolve();
        }
        function onError() {
          cleanup();
          reject();
        }
        ws.addEventListener('open', onOpen);
        ws.addEventListener('error', onError);
      });

      if (this.urlOptions.connectionParams) {
        ws.send(await buildConnectionMessage(this.urlOptions.connectionParams));
      }
    });
    try {
      await this.openPromise;
    } finally {
      this.openPromise = null;
    }
  }

  /**
   * Closes the WebSocket connection gracefully.
   * Waits for any ongoing open operation to complete before closing.
   */
  public async close() {
    try {
      await this.openPromise;
    } finally {
      this.ws?.close();
    }
  }
}

/**
 * Provides a backward-compatible representation of the connection state.
 */
export function backwardCompatibility(connection: WsConnection) {
  if (connection.isOpen()) {
    return {
      id: connection.id,
      state: 'open',
      ws: connection.ws,
    } as const;
  }

  if (connection.isClosed()) {
    return {
      id: connection.id,
      state: 'closed',
      ws: connection.ws,
    } as const;
  }

  if (!connection.ws) {
    return null;
  }

  return {
    id: connection.id,
    state: 'connecting',
    ws: connection.ws,
  } as const;
}
