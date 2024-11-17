import {behaviorSubject} from '@trpc/server/observable';
import {createWebSocketConnection} from './createWebSocketConnection';
import type {PingPongOptions} from './pingPong';
import {setupPingInterval, setupPingListener} from './pingPong';

export interface WebSocketConnectionOptions {
  WebSocketPonyfill?: typeof WebSocket;
  promiseUrl: Promise<string>;
  keepAlive: PingPongOptions & {
    enabled: boolean;
  }
}

/**
 * Manages a WebSocket connection with support for reconnection, keep-alive mechanisms,
 * and observable state tracking.
 */
export class WsConnection {
  static connectCount = 0;
  public id = ++WsConnection.connectCount;

  private readonly WebSocketPonyfill: typeof WebSocket;
  private readonly promiseUrl: Promise<string>;
  private readonly keepAliveOpts: WebSocketConnectionOptions['keepAlive'];
  public readonly wsObservable = behaviorSubject<WebSocket | null>(null);

  constructor(opts: WebSocketConnectionOptions) {
    this.WebSocketPonyfill = opts.WebSocketPonyfill ?? WebSocket;
    this.promiseUrl = opts.promiseUrl;
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
    return !!this.ws && this.ws.readyState === this.WebSocketPonyfill.OPEN;
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

    this.id = ++WsConnection.connectCount;
    const { wsPromise, openPromise } = createWebSocketConnection(
      this.promiseUrl,
      this.WebSocketPonyfill,
    );
    this.openPromise = openPromise;
    this.ws = await wsPromise;

    setupPingListener(this.ws);
    if (this.keepAliveOpts.enabled) {
      setupPingInterval(this.ws, this.keepAliveOpts);
    }

    this.ws.addEventListener('close', () => {
      this.ws = null;
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
    await this.openPromise;
    this.ws?.close();
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
