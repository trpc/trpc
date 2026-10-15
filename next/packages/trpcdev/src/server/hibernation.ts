import type { FetchHandler, PlatformArgs } from './fetch.ts';
import {
  connectionReceiver,
  parseSocketMessage,
  socketCores,
  type ConnectionReceiver,
} from './socket.ts';

/**
 * The server-side `WebSocket` a Durable Object gets from
 * `state.acceptWebSocket()`.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface HibernatableWebSocket {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  serializeAttachment(value: unknown): void;
  deserializeAttachment(): unknown;
}

/**
 * The parts of `DurableObjectState` the adapter uses.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface HibernationState {
  acceptWebSocket(socket: never, tags?: string[]): void;
  setWebSocketAutoResponse?(pair?: unknown): void;
}

/**
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface HibernatingWebSocketsOptions {
  /** The Durable Object's `ctx`. */
  state: HibernationState;
  /**
   * Request headers kept with each socket, so `createContext` sees them
   * after the object wakes. Everything kept, with the connection params,
   * must fit Cloudflare's 2 KB attachment limit.
   * @default ['authorization', 'cookie']
   */
  keepHeaders?: string[] | undefined;
}

/**
 * What `createHibernatingWebSockets()` returns. Call it from the Durable
 * Object's `fetch`, `webSocketMessage` and `webSocketClose`.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface HibernatingWebSockets<TPlatform> {
  /** Upgrades `request`: a `WebSocketPair`, accepted for hibernation, as a 101 response. */
  upgrade(request: Request, ...platform: PlatformArgs<TPlatform>): Response;
  /** Accepts a socket you created, for hibernation. */
  accept(
    socket: HibernatableWebSocket,
    request: Request,
    ...platform: PlatformArgs<TPlatform>
  ): void;
  /** From `webSocketMessage(ws, message)`. */
  message(
    socket: HibernatableWebSocket,
    data: string | ArrayBuffer,
    ...platform: PlatformArgs<TPlatform>
  ): void;
  /** From `webSocketClose(ws, code, reason)` and `webSocketError(ws)`. */
  close(socket: HibernatableWebSocket, code?: number, reason?: string): void;
}

interface Attachment {
  trpc: 1;
  url: string;
  headers: [string, string][];
  connectionParams?: Record<string, unknown> | undefined;
}

const OPEN = 1;

const isAttachment = (value: unknown): value is Attachment =>
  typeof value === 'object' &&
  value !== null &&
  (value as Attachment).trpc === 1 &&
  typeof (value as Attachment).url === 'string';

/**
 * Serves `handler`'s router over WebSockets that a Cloudflare Durable Object
 * accepts with hibernation, so idle connections don't keep it in memory.
 * The request URL, the `keepHeaders` and the connection params live in each
 * socket's attachment and are rebuilt when the object wakes. Keep-alive
 * pings are answered without waking it.
 *
 * A running subscription keeps the object awake until it ends.
 *
 * @example
 * ```ts
 * export class Room extends DurableObject<Env> {
 *   sockets = createHibernatingWebSockets(handler, { state: this.ctx });
 *   fetch(request: Request) {
 *     return this.sockets.upgrade(request, { env: this.env });
 *   }
 *   webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
 *     this.sockets.message(ws, message, { env: this.env });
 *   }
 *   webSocketClose(ws: WebSocket, code: number, reason: string) {
 *     this.sockets.close(ws, code, reason);
 *   }
 * }
 * ```
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export function createHibernatingWebSockets<TPlatform>(
  handler: FetchHandler<TPlatform>,
  opts: HibernatingWebSocketsOptions,
): HibernatingWebSockets<TPlatform> {
  const core = socketCores.get(handler);
  if (!core) {
    throw new TypeError(
      'createHibernatingWebSockets needs a handler from createFetchHandler',
    );
  }
  const keep = new Set(
    (opts.keepHeaders ?? ['authorization', 'cookie']).map((h) =>
      h.toLowerCase(),
    ),
  );
  const receivers = new WeakMap<HibernatableWebSocket, ConnectionReceiver>();

  const Pair = (
    globalThis as {
      WebSocketRequestResponsePair?: new (
        request: string,
        response: string,
      ) => unknown;
    }
  ).WebSocketRequestResponsePair;
  if (Pair) {
    opts.state.setWebSocketAutoResponse?.(
      new Pair(
        JSON.stringify({ type: 'ping' }),
        JSON.stringify({ type: 'pong' }),
      ),
    );
  }

  const receiverFor = (
    socket: HibernatableWebSocket,
    platform: unknown,
  ): ConnectionReceiver | undefined => {
    const attachment = socket.deserializeAttachment();
    if (!isAttachment(attachment)) return undefined;
    let receiver = receivers.get(socket);
    if (!receiver) {
      const request = new Request(attachment.url, {
        headers: attachment.headers,
      });
      receiver = connectionReceiver(
        core,
        {
          send(message) {
            if (socket.readyState === OPEN)
              socket.send(JSON.stringify(message));
          },
          close(code, reason) {
            socket.close(code, reason);
          },
        },
        {
          request,
          transport: 'websocket',
          connectionParams: attachment.connectionParams,
          onInit(connectionParams) {
            socket.serializeAttachment({ ...attachment, connectionParams });
          },
        },
      );
      receivers.set(socket, receiver);
      core.setPlatform(request, platform);
    }
    return receiver;
  };

  const sockets: HibernatingWebSockets<unknown> = {
    upgrade(request, ...platform) {
      const WebSocketPair = (
        globalThis as {
          WebSocketPair?: new () => {
            0: HibernatableWebSocket;
            1: HibernatableWebSocket;
          };
        }
      ).WebSocketPair;
      if (!WebSocketPair) {
        throw new TypeError(
          'upgrade() needs WebSocketPair (Cloudflare Workers)',
        );
      }
      const { 0: client, 1: server } = new WebSocketPair();
      sockets.accept(server, request, ...platform);
      return new Response(null, {
        status: 101,
        webSocket: client,
      } as ResponseInit);
    },
    accept(socket, request, ...platform) {
      const attachment: Attachment = {
        trpc: 1,
        url: request.url,
        headers: [...request.headers].filter(([name]) => keep.has(name)),
      };
      socket.serializeAttachment(attachment);
      opts.state.acceptWebSocket(socket as never);
      receiverFor(socket, platform[0]);
    },
    message(socket, data, ...platform) {
      const receiver = receiverFor(socket, platform[0]);
      if (!receiver) {
        socket.close(1011, 'Not a tRPC socket');
        return;
      }
      receiver.receive(parseSocketMessage(data));
    },
    close(socket, code, reason) {
      receivers.get(socket)?.close();
      receivers.delete(socket);
      try {
        // 1005 and 1006 are reported, never sent.
        socket.close(code === 1005 || code === 1006 ? 1000 : code, reason);
      } catch {
        // Already closed.
      }
    },
  };
  return sockets as HibernatingWebSockets<TPlatform>;
}
