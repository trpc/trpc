import { observable, observableToAsyncIterable } from '@trpc/server/observable';
import type { TRPCClientIncomingMessage } from '@trpc/server/unstable-core-do-not-import';
import {
  isObject,
  makeResource,
} from '@trpc/server/unstable-core-do-not-import';
import type { UrlOptionsWithConnectionParams } from '../../internals/urlWithConnectionParams';
import type { Encoder } from './encoder';
import type { ConnectionEvent } from './machine/connectionMachine';
import type { ConnectionId } from './machine/requestMachine';
import type { KeepAliveOptions } from './options';
import type { Scope } from './scope';
import {
  createScope,
  dispose,
  listenerResource,
  timeoutResource,
} from './scope';
import {
  buildConnectionMessage,
  prepareUrl,
  TRPCWebSocketClosedError,
} from './utils';

/** What a socket reports: a connection event, a decoded frame, or a keepAlive `PING`/`PONG`. */
export type TransportEvent =
  | ConnectionEvent
  | { type: 'frame'; message: TRPCClientIncomingMessage }
  | { type: 'heartbeat' };

export interface TransportOptions {
  id: ConnectionId;
  WebSocketPonyfill: typeof WebSocket;
  urlOptions: UrlOptionsWithConnectionParams;
  keepAlive: KeepAliveOptions;
  encoder: Encoder;
}

/**
 * One WebSocket's I/O. It opens the socket, decodes frames and runs
 * keepAlive, and `events` says what happens; the connection state machine
 * decides what any of it means. Disposing it ends the connection: keepAlive
 * stops and the socket closes. `events` goes on until the socket's `close`,
 * for the user's `onClose` and `onError`.
 */
export type Transport = TransportApi & Disposable;

interface TransportApi {
  readonly id: ConnectionId;
  /** The socket, once the URL is resolved. */
  readonly ws: () => WebSocket | null;
  /**
   * What the socket reports, in order, for one consumer. It ends after the
   * socket's `close`, or without a socket when opening failed or the
   * connection ended first. `return()` removes the socket's listeners.
   */
  readonly events: AsyncIterable<TransportEvent>;
  /** Whether a message sent now goes out on this socket. */
  readonly isWritable: () => boolean;
  /** Sends `data` if the socket is writable, and says whether it did. */
  readonly send: (data: Parameters<WebSocket['send']>[0]) => boolean;
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

/** For iterables that end by themselves or by `return()`, never by abort. */
const neverAborted = new AbortController().signal;

export function openTransport(opts: TransportOptions): Transport {
  /** Everything that stops when the client ends the connection. */
  const io = createScope();
  let ws: WebSocket | null = null;

  async function* events(): AsyncGenerator<TransportEvent, void> {
    let socket: WebSocket;
    try {
      const url = await prepareUrl(opts.urlOptions);
      if (io.disposed) return;
      socket = new opts.WebSocketPonyfill(url);
      // Handle text and binary messages consistently.
      socket.binaryType = 'arraybuffer';
    } catch (cause) {
      yield { type: 'openFailed', cause };
      return;
    }
    ws = socket;
    yield* observableToAsyncIterable(
      socketEvents(socket, io, opts),
      neverAborted,
    );
  }

  const isWritable = () => !io.disposed && ws?.readyState === READY_STATE.OPEN;

  const api: TransportApi = {
    id: opts.id,
    ws: () => ws,
    events: events(),
    isWritable,
    send(data) {
      if (!isWritable()) return false;
      ws?.send(data);
      return true;
    },
  };
  return makeResource(api, () => {
    dispose(io);
    const socket = ws;
    if (socket?.readyState === READY_STATE.CONNECTING) {
      // Closing a socket that isn't open yet reports an error; wait for it.
      socket.addEventListener('open', () => socket.close(), { once: true });
    } else if (socket?.readyState === READY_STATE.OPEN) {
      socket.close();
    }
  });
}

/**
 * A socket's events until its `close`. Unsubscribing removes its listeners
 * and stops keepAlive, as does `io` ending.
 */
function socketEvents(ws: WebSocket, io: Scope, opts: TransportOptions) {
  return observable<TransportEvent, never>((emit) => {
    const listeners = createScope();
    const keepAlive = listeners.use(
      io.use(
        createKeepAlive(ws, opts.keepAlive, () =>
          emit.next({ type: 'pongTimeout' }),
        ),
      ),
    );

    listeners.use(
      listenerResource(ws, 'open', () => {
        keepAlive.start();
        emit.next({ type: 'socketOpened' });
      }),
    );
    listeners.use(
      listenerResource(ws, 'message', ({ data }) => {
        keepAlive.onFrame(data);
        if (data === 'PING' || data === 'PONG') {
          if (data === 'PING' && !io.disposed) ws.send('PONG');
          emit.next({ type: 'heartbeat' });
          return;
        }
        emit.next(decodeFrame(opts.encoder, data));
      }),
    );
    listeners.use(
      listenerResource(ws, 'error', (event) =>
        emit.next({ type: 'socketError', event }),
      ),
    );
    listeners.use(
      listenerResource(ws, 'close', (event) => {
        emit.next({ type: 'socketClosed', event });
        emit.complete();
      }),
    );
    return () => dispose(listeners);
  });
}

/** The connection's `connectionParams` message, or why it couldn't be made. */
export async function* connectionParamsEvents(
  urlOptions: UrlOptionsWithConnectionParams,
  encoder: Encoder,
): AsyncGenerator<ConnectionEvent, void> {
  const { connectionParams } = urlOptions;
  let event: ConnectionEvent;
  try {
    event = {
      type: 'paramsResolved',
      data: connectionParams
        ? await buildConnectionMessage(connectionParams, encoder)
        : null,
    };
  } catch (cause) {
    event = { type: 'openFailed', cause };
  }
  yield event;
}

/**
 * Pings every `intervalMs` after the last frame, and reports a pong timeout
 * when no `PONG` comes within `pongTimeoutMs`.
 */
function createKeepAlive(
  ws: WebSocket,
  options: KeepAliveOptions,
  onPongTimeout: () => void,
) {
  let stopped = false;
  let ping: Disposable | null = null;
  let pong: Disposable | null = null;
  const clear = (timer: Disposable | null) => {
    if (timer) dispose(timer);
    return null;
  };

  const schedulePing = () => {
    ping = clear(ping);
    ping = timeoutResource(() => {
      ping = null;
      if (ws.readyState !== READY_STATE.OPEN) return;
      ws.send('PING');
      if (pong) return;
      pong = timeoutResource(() => {
        pong = null;
        // A socket that is already closing was closed on purpose.
        if (ws.readyState !== READY_STATE.OPEN) return;
        onPongTimeout();
      }, options.pongTimeoutMs);
    }, options.intervalMs);
  };

  return makeResource(
    {
      start() {
        if (options.enabled && !stopped) schedulePing();
      },
      /** Any frame restarts the ping interval; only a `PONG` clears a pending pong timeout. */
      onFrame(data: unknown) {
        if (!options.enabled || stopped) return;
        if (data === 'PONG') pong = clear(pong);
        schedulePing();
      },
    },
    () => {
      stopped = true;
      ping = clear(ping);
      pong = clear(pong);
    },
  );
}

/**
 * A server request (`method`) or a response (`id` and a `result` or `error`
 * object).
 */
function isIncomingMessage(value: unknown): value is TRPCClientIncomingMessage {
  return (
    isObject(value) &&
    ('method' in value ||
      ('id' in value &&
        (isObject(value['result']) || isObject(value['error']))))
  );
}

function decodeFrame(
  encoder: Encoder,
  data: string | ArrayBuffer | Uint8Array,
): TransportEvent {
  try {
    const message = encoder.decode(data);
    if (!isIncomingMessage(message)) {
      throw new TypeError('Expected a tRPC message');
    }
    return { type: 'frame', message };
  } catch (cause) {
    return {
      type: 'badFrame',
      // The frame may have carried a response, and its request would wait
      // forever, so the connection is treated as lost.
      error: new TRPCWebSocketClosedError({
        message: 'Received a message that could not be decoded',
        cause,
      }),
      cause,
    };
  }
}

/**
 * The shape `wsClient.connection` has always had.
 */
export function backwardCompatibility(
  transport: Transport | null,
  ready: boolean,
) {
  const ws = transport?.ws();
  if (!transport || !ws) return null;

  if (
    ws.readyState === READY_STATE.CLOSING ||
    ws.readyState === READY_STATE.CLOSED
  ) {
    return { id: transport.id, state: 'closed', ws } as const;
  }
  if (ready && ws.readyState === READY_STATE.OPEN) {
    return { id: transport.id, state: 'open', ws } as const;
  }
  return { id: transport.id, state: 'connecting', ws } as const;
}
