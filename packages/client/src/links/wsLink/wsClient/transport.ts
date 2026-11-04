import type { TRPCClientIncomingMessage } from '@trpc/server/unstable-core-do-not-import';
import { makeResource } from '@trpc/server/unstable-core-do-not-import';
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
  onEvent: (event: TransportEvent) => void;
}

/**
 * One WebSocket's I/O. It opens the socket, reports what happens to it,
 * decodes frames and runs keepAlive; the connection state machine decides
 * what any of it means. Disposing it ends the I/O and closes the socket. The
 * socket's own `close` and `error` events are still reported afterwards, for
 * the user's `onClose` and `onError`.
 */
export type Transport = TransportApi & Disposable;

interface TransportApi {
  readonly id: ConnectionId;
  /** The socket, once the URL is resolved. */
  readonly ws: () => WebSocket | null;
  readonly resolveParams: () => void;
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

export function openTransport(opts: TransportOptions): Transport {
  /** Everything that stops when the client ends the connection. */
  const io = createScope();
  let ws: WebSocket | null = null;

  const report = (event: TransportEvent) => {
    if (!io.disposed) opts.onEvent(event);
  };

  prepareUrl(opts.urlOptions)
    .then((url) => {
      if (io.disposed) return;
      const socket = new opts.WebSocketPonyfill(url);
      // Handle text and binary messages consistently.
      socket.binaryType = 'arraybuffer';
      ws = socket;
      listen(socket, io, opts);
    })
    .catch((cause: unknown) => report({ type: 'openFailed', cause }));

  const isWritable = () => !io.disposed && ws?.readyState === READY_STATE.OPEN;

  const api: TransportApi = {
    id: opts.id,
    ws: () => ws,
    isWritable,
    send(data) {
      if (!isWritable()) return false;
      ws?.send(data);
      return true;
    },
    resolveParams() {
      const { connectionParams } = opts.urlOptions;
      if (!connectionParams) {
        // Still asynchronous, as resolving them would be.
        void Promise.resolve().then(() =>
          report({ type: 'paramsResolved', data: null }),
        );
        return;
      }
      buildConnectionMessage(connectionParams, opts.encoder).then(
        (data) => report({ type: 'paramsResolved', data }),
        (cause: unknown) => report({ type: 'openFailed', cause }),
      );
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

function listen(ws: WebSocket, io: Scope, opts: TransportOptions) {
  const report = (event: TransportEvent) => {
    if (!io.disposed) opts.onEvent(event);
  };
  const keepAlive = io.use(createKeepAlive(ws, opts.keepAlive, report));

  io.use(
    listenerResource(ws, 'open', () => {
      keepAlive.start();
      report({ type: 'socketOpened' });
    }),
  );

  io.use(
    listenerResource(ws, 'message', ({ data }) => {
      keepAlive.onFrame(data);
      if (data === 'PING' || data === 'PONG') {
        if (data === 'PING') ws.send('PONG');
        report({ type: 'heartbeat' });
        return;
      }

      let message: TRPCClientIncomingMessage;
      try {
        message = decodeMessage(opts.encoder, data);
      } catch (cause) {
        report({
          type: 'badFrame',
          // The frame may have carried a response, and its request would
          // wait forever, so the connection is treated as lost.
          error: new TRPCWebSocketClosedError({
            message: 'Received a message that could not be decoded',
            cause,
          }),
          cause,
        });
        return;
      }
      report({ type: 'frame', message });
    }),
  );

  // The socket's own lifetime: its `close` and `error` reach the user even
  // after the client has ended the connection.
  const socket = createScope();
  socket.use(
    listenerResource(ws, 'error', (event) =>
      opts.onEvent({ type: 'socketError', event }),
    ),
  );
  socket.use(
    listenerResource(ws, 'close', (event) => {
      dispose(keepAlive);
      dispose(socket);
      opts.onEvent({ type: 'socketClosed', event });
    }),
  );
}

/**
 * Pings every `intervalMs` after the last frame, and reports a pong timeout
 * when no `PONG` comes within `pongTimeoutMs`.
 */
function createKeepAlive(
  ws: WebSocket,
  options: KeepAliveOptions,
  report: (event: TransportEvent) => void,
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
        report({ type: 'pongTimeout' });
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
