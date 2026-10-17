import { Effect, Exit, Stream } from 'effect';
import { HttpServerRequest } from 'effect/http';
import {
  isTrpcError,
  toWireError,
  type AnyTrpcError,
} from '../internal/error.ts';
import type { ServerMessage } from '../internal/protocol.ts';
import { emitEvents } from '../server/events.ts';
import {
  normalizeCause,
  procedureEvents,
  unexpectedError,
} from '../server/execute.ts';
import type { FetchHandler, PlatformArgs } from '../server/fetch.ts';
import { resolveProcedure } from '../server/router.ts';
import {
  connectionReceiver,
  frameMessage,
  parseSocketMessage,
  socketCores,
  type ConnectionReceiver,
  type SocketCore,
} from '../server/socket.ts';
import { tracked, type TrackedEnvelope } from '../server/tracked.ts';

/**
 * The server-side `WebSocket` a Durable Object gets from
 * `state.acceptWebSocket()`.
 * @since 0.1.0
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
 * @since 0.1.0
 * @stability experimental
 */
export interface HibernationState {
  acceptWebSocket(socket: never, tags?: string[]): void;
  setWebSocketAutoResponse?(pair?: unknown): void;
  /** The object's accepted sockets. `hibernatingPublisher` sends events to them. */
  getWebSockets?(tag?: string): HibernatableWebSocket[];
}

/**
 * @since 0.1.0
 * @stability experimental
 */
export interface HibernatingWebSocketsOptions {
  /** The Durable Object's `ctx`. */
  state: HibernationState;
  /**
   * Request headers kept with each socket, so `createContext` sees them
   * after the object wakes. When the attachment would pass Cloudflare's
   * 2 KB limit, they're dropped with a warning.
   * @default ['authorization', 'cookie']
   */
  keepHeaders?: string[] | undefined;
}

/**
 * What `experimental_createHibernatingWebSockets()` returns. Call it from the Durable
 * Object's `fetch`, `webSocketMessage` and `webSocketClose`.
 * @since 0.1.0
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

/** A parked publisher subscription: call id, publisher key, channel, path. */
interface Parked {
  c: number;
  k: string;
  ch: string;
  p: string;
}

interface Attachment {
  trpc: 1;
  url: string;
  headers: [string, string][];
  connectionParams?: Record<string, unknown> | undefined;
  subs?: Parked[] | undefined;
}

const OPEN = 1;
/** Cloudflare's limit for `serializeAttachment()`. */
const ATTACHMENT_LIMIT = 2048;

const isAttachment = (value: unknown): value is Attachment =>
  typeof value === 'object' &&
  value !== null &&
  (value as Attachment).trpc === 1 &&
  typeof (value as Attachment).url === 'string';

const encoder = new TextEncoder();
const fits = (attachment: Attachment) =>
  encoder.encode(JSON.stringify(attachment)).length <= ATTACHMENT_LIMIT;

const warn = (message: string) => {
  console.warn(`[@trpc12/trpc/cloudflare] ${message}`);
};

/**
 * Stores `next` on the socket, dropping the kept headers if that's what
 * it takes to fit. `undefined` when it doesn't fit even without them.
 */
function store(
  socket: HibernatableWebSocket,
  next: Attachment,
): Attachment | undefined {
  if (fits(next)) {
    socket.serializeAttachment(next);
    return next;
  }
  if (next.headers.length > 0) {
    const slim: Attachment = { ...next, headers: [] };
    if (fits(slim)) {
      warn(
        `Dropped the kept headers (${next.headers.map(([n]) => n).join(', ')}) of a socket: with them its attachment passes Cloudflare's 2 KB limit. createContext won't see them after the object wakes.`,
      );
      socket.serializeAttachment(slim);
      return slim;
    }
  }
  return undefined;
}

type Deliver = (
  key: string,
  channel: string,
  event: TrackedEnvelope<unknown>,
) => Promise<void>;

/**
 * The adapter serving each Durable Object, for `hibernatingPublisher`. The
 * latest one wins: a woken instance replaces the evicted one.
 * @internal
 */
export const deliveries: WeakMap<HibernationState, Deliver> = new WeakMap();

const requestOf = (attachment: Attachment) =>
  HttpServerRequest.fromWeb(
    new Request(attachment.url, { headers: attachment.headers }),
  );

/**
 * Serves `handler`'s router over WebSockets that a Cloudflare Durable Object
 * accepts with hibernation, so idle connections don't keep it in memory.
 * The request URL, the `keepHeaders` and the connection params live in each
 * socket's attachment and are rebuilt when the object wakes. Keep-alive
 * pings are answered without waking it.
 *
 * Subscriptions to a `hibernatingPublisher` are kept in the attachment
 * too, and its events are sent straight to the sockets, so the object
 * sleeps between them. Other subscriptions keep it awake until they end.
 *
 * @example
 * ```ts
 * export class Room extends DurableObject<Env> {
 *   sockets = experimental_createHibernatingWebSockets(handler, { state: this.ctx });
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
 * @since 0.1.0
 * @stability experimental
 */
export function experimental_createHibernatingWebSockets<TPlatform>(
  handler: FetchHandler<TPlatform>,
  opts: HibernatingWebSocketsOptions,
): HibernatingWebSockets<TPlatform> {
  const core = socketCores.get(handler);
  if (!core) {
    throw new TypeError(
      'experimental_createHibernatingWebSockets needs a handler from createFetchHandler',
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

  const current = (socket: HibernatableWebSocket) => {
    const attachment = socket.deserializeAttachment();
    return isAttachment(attachment) ? attachment : undefined;
  };

  const unpark = (socket: HibernatableWebSocket, id: number) => {
    const attachment = current(socket);
    if (!attachment?.subs?.some((s) => s.c === id)) return;
    const { subs: all, ...rest } = attachment;
    const subs = all.filter((s) => s.c !== id);
    store(socket, subs.length ? { ...rest, subs } : rest);
  };

  const receiverFor = (
    socket: HibernatableWebSocket,
    platform: unknown,
  ): ConnectionReceiver | undefined => {
    const attachment = current(socket);
    if (!attachment) return undefined;
    let receiver = receivers.get(socket);
    if (!receiver) {
      const request = requestOf(attachment);
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
          platform,
          transport: 'websocket',
          connectionParams: attachment.connectionParams,
          onInit(connectionParams) {
            const now = current(socket) ?? attachment;
            if (!store(socket, { ...now, connectionParams })) {
              warn(
                "A socket's connection params pass Cloudflare's 2 KB attachment limit; createContext won't see them after the object wakes.",
              );
              store(socket, {
                ...now,
                headers: [],
                connectionParams: undefined,
              });
            }
          },
          hibernate(sub) {
            const now = current(socket) ?? attachment;
            const subs: Parked[] = [
              ...(now.subs ?? []),
              { c: sub.id, k: sub.key, ch: sub.channel, p: sub.path },
            ];
            if (store(socket, { ...now, subs })) return true;
            warn(
              `The subscription "${sub.path}" doesn't fit the socket's 2 KB attachment, so it keeps the object awake.`,
            );
            return false;
          },
          unpark(id) {
            unpark(socket, id);
          },
        },
      );
      receivers.set(socket, receiver);
    }
    return receiver;
  };

  const deliver: Deliver = async (key, channel, event) => {
    const sockets = opts.state.getWebSockets?.() ?? [];
    await Promise.all(
      sockets.flatMap((socket) => {
        const attachment = current(socket);
        return (attachment?.subs ?? [])
          .filter((s) => s.k === key && s.ch === channel)
          .map((sub) =>
            sendEvent(
              core,
              socket,
              attachment!,
              sub,
              tracked(event.id, event.data),
            ),
          );
      }),
    );
  };

  const sendEvent = async (
    core: SocketCore,
    socket: HibernatableWebSocket,
    attachment: Attachment,
    sub: Parked,
    event: TrackedEnvelope<unknown>,
  ) => {
    const send = (message: ServerMessage) => {
      if (socket.readyState === OPEN) socket.send(JSON.stringify(message));
    };
    const request = requestOf(attachment);
    const procedure = await resolveProcedure(core.router, sub.p);
    if (!procedure) return;
    const report = (err: AnyTrpcError) => {
      core.report(err, request, sub.p, 'subscription');
      return toWireError(core.publicError(err));
    };
    const exit = await Effect.runPromiseExit(
      emitEvents(
        procedureEvents(procedure, Stream.make(event)),
        core.serializer,
        (cause) => report(isTrpcError(cause) ? cause : unexpectedError(cause)),
        (frame) => send(frameMessage(sub.c, frame)),
      ),
    );
    if (Exit.isFailure(exit)) {
      const err = normalizeCause(exit.cause);
      send({
        id: sub.c,
        type: 'error',
        body: core.serializer.serialize(report(err)),
      });
      unpark(socket, sub.c);
    }
  };

  deliveries.set(opts.state, deliver);

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
      if (!store(socket, attachment)) {
        warn(
          "A socket's request URL passes Cloudflare's 2 KB attachment limit.",
        );
        socket.serializeAttachment({ ...attachment, headers: [] });
      }
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
