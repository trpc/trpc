import type { TRPCClientIncomingMessage } from '@trpc/server/unstable-core-do-not-import';
import type { UrlOptionsWithConnectionParams } from '../../internals/urlWithConnectionParams';
import type { Encoder } from './encoder';
import type { KeepAliveOptions } from './options';
import {
  buildConnectionMessage,
  prepareUrl,
  rethrowAsync,
  TRPCWebSocketClosedError,
} from './utils';

/**
 * A connection's phase. It only moves forward:
 * `opening` → `ready` → `draining` → `closed`, and any phase can go straight
 * to `closed`.
 */
export type ConnectionPhase =
  /** Resolving the URL, waiting for the socket to open, sending `connectionParams`. */
  | 'opening'
  /** New requests are sent here. */
  | 'ready'
  /**
   * Replaced: nothing new is sent here, the requests already sent finish
   * here, and the client closes it once they have.
   */
  | 'draining'
  /** Closed or lost. Only the user's `onClose` and `onError` still hear from it. */
  | 'closed';

/**
 * What a connection tells its owner. Calls stop once the connection is
 * `closed`, except `onSocketClose` and `onSocketError`, which report every
 * socket's events to the user's callbacks.
 */
export interface ConnectionEvents {
  /** The socket opened; `connectionParams` may still be pending. */
  onSocketOpen: (connection: Connection) => void;
  /** The socket is open and `connectionParams` were sent. */
  onReady: (connection: Connection) => void;
  /** Resolving the URL or `connectionParams` failed, or the socket couldn't be created. */
  onOpenFailed: (connection: Connection, cause: unknown) => void;
  onMessage: (
    connection: Connection,
    message: TRPCClientIncomingMessage,
  ) => void;
  /**
   * Once per socket: its `close` event, or the client giving up on the socket
   * without waiting for the closing handshake (`event` is then `undefined`):
   * a keepAlive pong timeout or a frame it couldn't decode. `cause` is the
   * `close` event, or why the client gave up.
   */
  onSocketClose: (
    connection: Connection,
    event: CloseEvent | undefined,
    cause: unknown,
  ) => void;
  /** An `error` event before the socket closed. */
  onSocketError: (connection: Connection, event: Event) => void;
}

export interface ConnectionOptions {
  WebSocketPonyfill: typeof WebSocket;
  urlOptions: UrlOptionsWithConnectionParams;
  keepAlive: KeepAliveOptions;
  encoder: Encoder;
  events: ConnectionEvents;
  /**
   * The `retryDelayMs` attempt index this connection was opened after, or
   * `null` for an open that isn't a retry.
   */
  retryIndex: number | null;
}

/**
 * `WebSocket.readyState` values, fixed by the spec. Not every ponyfill puts
 * them on its instances.
 */
const READY_STATE = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
} as const;

let connectCount = 0;

/**
 * One WebSocket and everything tied to its lifetime: its listeners, its
 * keepAlive timers and its phase. `close()` ends that scope: timers stop and
 * the socket's later frames are dropped.
 */
export class Connection {
  public readonly id = ++connectCount;
  public readonly retryIndex: number | null;
  public phase: ConnectionPhase = 'opening';
  public ws: WebSocket | null = null;
  /**
   * Set when the server rejected this connection with an `id: null` error,
   * e.g. because `createContext` threw, and cleared by any result, which
   * proves it was accepted. A rejected connection's reconnect carries on with
   * the backoff instead of starting over.
   * @see https://github.com/trpc/trpc/issues/4774
   */
  public rejected = false;

  private readonly opts: ConnectionOptions;
  private closeReported = false;
  private pingTimeout: ReturnType<typeof setTimeout> | null = null;
  private pongTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: ConnectionOptions) {
    this.opts = opts;
    this.retryIndex = opts.retryIndex;
  }

  public start() {
    prepareUrl(this.opts.urlOptions)
      .then((url) => {
        if (this.phase === 'closed') return;
        const ws = new this.opts.WebSocketPonyfill(url);
        // Handle text and binary messages consistently.
        ws.binaryType = 'arraybuffer';
        this.ws = ws;
        this.listen(ws);
      })
      .catch((cause) => this.failOpen(cause));
  }

  /**
   * Whether a message sent now goes out on this connection's socket.
   */
  public isWritable(): this is { ws: WebSocket } {
    return (
      (this.phase === 'ready' || this.phase === 'draining') &&
      this.ws?.readyState === READY_STATE.OPEN
    );
  }

  public send(data: Parameters<WebSocket['send']>[0]) {
    if (!this.isWritable()) return false;
    this.ws.send(data);
    return true;
  }

  /**
   * Stops taking new requests. The owner closes the connection once the
   * requests already sent on it have settled.
   */
  public drain() {
    if (this.phase === 'opening' || this.phase === 'ready') {
      this.phase = 'draining';
    }
  }

  /**
   * Ends the connection's scope: stops its timers, closes its socket, and
   * drops everything the socket still delivers except the user's `onClose`
   * and `onError`.
   */
  public close() {
    if (this.phase === 'closed') return;
    this.phase = 'closed';
    this.stopKeepAlive();

    const ws = this.ws;
    if (!ws) return;
    if (ws.readyState === READY_STATE.CONNECTING) {
      // Closing a socket that isn't open yet reports an error; wait for it.
      ws.addEventListener('open', () => ws.close());
    } else if (ws.readyState === READY_STATE.OPEN) {
      ws.close();
    }
  }

  private failOpen(cause: unknown) {
    if (this.phase !== 'opening') return;
    this.opts.events.onOpenFailed(this, cause);
  }

  private reportClose(event: CloseEvent | undefined, cause: unknown) {
    if (this.closeReported) return;
    this.closeReported = true;
    this.stopKeepAlive();
    this.opts.events.onSocketClose(this, event, cause);
  }

  /**
   * Closes the socket and reports it closed at once: the server may never
   * answer the closing handshake.
   */
  private abandon(ws: WebSocket, cause: unknown) {
    ws.close();
    this.reportClose(undefined, cause);
  }

  private listen(ws: WebSocket) {
    const { events, encoder } = this.opts;

    ws.addEventListener('open', () => {
      if (this.phase !== 'opening') return;
      events.onSocketOpen(this);
      if (this.opts.keepAlive.enabled) this.schedulePing();
      this.sendConnectionParams().then(
        () => {
          if (this.phase !== 'opening') return;
          this.phase = 'ready';
          events.onReady(this);
        },
        (cause) => this.failOpen(cause),
      );
    });

    ws.addEventListener('message', ({ data }) => {
      if (this.closeReported) return;
      if (this.opts.keepAlive.enabled) this.onActivity(data);
      if (data === 'PING') {
        ws.send('PONG');
        return;
      }
      if (data === 'PONG' || this.phase === 'closed') return;

      let message: TRPCClientIncomingMessage;
      try {
        message = decodeMessage(encoder, data);
      } catch (cause) {
        // The frame may have carried a response, and its request would wait
        // forever, so the connection is treated as lost.
        this.abandon(
          ws,
          new TRPCWebSocketClosedError({
            message: 'Received a message that could not be decoded',
            cause,
          }),
        );
        rethrowAsync(cause);
        return;
      }
      events.onMessage(this, message);
    });

    ws.addEventListener('close', (event) => this.reportClose(event, event));

    ws.addEventListener('error', (event) => {
      if (this.closeReported) return;
      events.onSocketError(this, event);
    });
  }

  private async sendConnectionParams() {
    const { connectionParams } = this.opts.urlOptions;
    if (!connectionParams) return;
    const message = await buildConnectionMessage(
      connectionParams,
      this.opts.encoder,
    );
    if (this.phase !== 'opening') return;
    this.ws?.send(message);
  }

  /**
   * Any frame restarts the ping interval; only a `PONG` clears a pending pong
   * timeout.
   */
  private onActivity(data: unknown) {
    if (data === 'PONG' && this.pongTimeout) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = null;
    }
    this.schedulePing();
  }

  private schedulePing() {
    if (this.pingTimeout) clearTimeout(this.pingTimeout);
    const { intervalMs, pongTimeoutMs } = this.opts.keepAlive;
    this.pingTimeout = setTimeout(() => {
      const ws = this.ws;
      if (!ws || ws.readyState !== READY_STATE.OPEN) return;
      ws.send('PING');
      if (this.pongTimeout) return;
      this.pongTimeout = setTimeout(() => {
        this.pongTimeout = null;
        // A socket that is already closing was closed on purpose.
        if (ws.readyState !== READY_STATE.OPEN) return;
        this.abandon(ws, undefined);
      }, pongTimeoutMs);
    }, intervalMs);
  }

  private stopKeepAlive() {
    if (this.pingTimeout) clearTimeout(this.pingTimeout);
    if (this.pongTimeout) clearTimeout(this.pongTimeout);
    this.pingTimeout = null;
    this.pongTimeout = null;
  }
}

function decodeMessage(
  encoder: Encoder,
  data: string | ArrayBuffer | Uint8Array,
): TRPCClientIncomingMessage {
  const message: unknown = encoder.decode(data);
  if (typeof message !== 'object' || message === null) {
    throw new TypeError(`Expected a message object, received ${message}`);
  }
  return message as TRPCClientIncomingMessage;
}

/**
 * The shape `wsClient.connection` has always had.
 */
export function backwardCompatibility(connection: Connection | null) {
  const ws = connection?.ws;
  if (!connection || !ws) return null;

  if (
    ws.readyState === READY_STATE.CLOSING ||
    ws.readyState === READY_STATE.CLOSED
  ) {
    return { id: connection.id, state: 'closed', ws } as const;
  }
  if (connection.phase === 'ready' && ws.readyState === READY_STATE.OPEN) {
    return { id: connection.id, state: 'open', ws } as const;
  }
  return { id: connection.id, state: 'connecting', ws } as const;
}
