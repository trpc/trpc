import { Context, Effect, Exit, Fiber, FiberSet, Scope, Stream } from 'effect';
import { HttpEffect, HttpServerRequest, HttpServerResponse } from 'effect/http';
import {
  isTrpcError,
  toWireError,
  type AnyTrpcError,
} from '../internal/error.ts';
import type { ServerMessage } from '../internal/protocol.ts';
import {
  emitEvents,
  normalizeCause,
  procedureEvents,
  unexpectedError,
} from '../server/execution/index.ts';
import {
  type FetchHandler,
  type PlatformArgs,
  HttpApp,
  handlerContext,
  withMiddleware,
} from '../server/handler/index.ts';
import { resolveProcedureEffect } from '../server/procedures/index.ts';
import {
  connectionReceiver,
  frameMessage,
  parseSocketMessage,
  SocketCore,
  type ConnectionReceiver,
} from '../server/sockets/index.ts';
import {
  tracked,
  type TrackedEnvelope,
} from '../server/subscriptions/index.ts';

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
  /** The object's accepted sockets. `experimental_hibernatingPublisher` sends events to them. */
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
  /**
   * Upgrades `request`: a `WebSocketPair`, accepted for hibernation, as a
   * 101 response. It runs inside the handler's `middleware`, so `cors()`
   * answers an upgrade from an origin it doesn't allow with a 403 before a
   * socket exists. Rejects outside Workers, where there's no `WebSocketPair`.
   */
  upgrade(
    request: Request,
    ...platform: PlatformArgs<TPlatform>
  ): Promise<Response>;
  /**
   * Accepts a socket you created, for hibernation. It's already open, so
   * the handler's `middleware` doesn't run: check the origin before
   * creating it, or use `upgrade()`.
   */
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

const encoder = /* @__PURE__ */ new TextEncoder();
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
) => Effect.Effect<void>;

/**
 * The adapter serving each Durable Object, for `experimental_hibernatingPublisher`. The
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
 * Subscriptions to an `experimental_hibernatingPublisher` are kept in the attachment
 * too, and its events are sent straight to the sockets, so the object
 * sleeps between them. Other subscriptions keep it awake until they end.
 *
 * `upgrade()` runs the handler's `middleware`, so `cors({ allowedOrigins })`
 * refuses cross-origin upgrades.
 *
 * @example
 * ```ts
 * const handler = createFetchHandler<AppRouter, { env: Env }>({
 *   router,
 *   middleware: [cors({ allowedOrigins: ['https://app.example.com'] })],
 * });
 *
 * export class Room extends DurableObject<Env> {
 *   sockets = experimental_createHibernatingWebSockets(handler, { state: this.ctx });
 *   fetch(request: Request): Promise<Response> {
 *     if (request.headers.get('upgrade') !== 'websocket') {
 *       return handler.fetch(request, { env: this.env });
 *     }
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
  const services = handlerContext(handler);
  const core = Context.getOrUndefined(services, SocketCore);
  if (!core) {
    throw new TypeError(
      'experimental_createHibernatingWebSockets needs a handler from createFetchHandler',
    );
  }
  const middleware =
    Context.getOrUndefined(services, HttpApp)?.middleware ?? [];
  const keep = new Set(
    (opts.keepHeaders ?? ['authorization', 'cookie']).map((h) =>
      h.toLowerCase(),
    ),
  );
  /**
   * The object's lifetime: every callback's work is a fiber in its
   * `FiberSet`, and each socket's calls run in a scope forked from it.
   */
  const owner = Scope.makeUnsafe();
  const run = Effect.runSync(
    Scope.provide(FiberSet.makeRuntime<never, void, never>(), owner),
  );
  /** Each socket's receiver, its calls in the scope that `close()` ends. */
  const receivers = new WeakMap<
    HibernatableWebSocket,
    { receiver: ConnectionReceiver; scope: Scope.Closeable }
  >();

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

  const connect = Effect.fnUntraced(function* (
    socket: HibernatableWebSocket,
    attachment: Attachment,
    platform: unknown,
  ) {
    const scope = yield* Scope.fork(owner);
    const receiver = yield* connectionReceiver(
      core,
      {
        send: (message) =>
          Effect.sync(() => {
            if (socket.readyState === OPEN)
              socket.send(JSON.stringify(message));
          }),
        close(code, reason) {
          socket.close(code, reason);
        },
      },
      {
        request: requestOf(attachment),
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
    ).pipe(Scope.provide(scope));
    receivers.set(socket, { receiver, scope });
    return receiver;
  });

  /**
   * The socket's receiver, made from its attachment on its first callback
   * since the object woke; `undefined` for a socket the adapter didn't
   * accept.
   */
  const receiverFor = (
    socket: HibernatableWebSocket,
    platform: unknown,
  ): Effect.Effect<ConnectionReceiver | undefined> =>
    Effect.suspend(() => {
      const served = receivers.get(socket);
      if (served) return Effect.succeed(served.receiver);
      const attachment = current(socket);
      return attachment
        ? connect(socket, attachment, platform)
        : Effect.succeed(undefined);
    });

  const sendEvent = Effect.fnUntraced(function* (
    socket: HibernatableWebSocket,
    attachment: Attachment,
    sub: Parked,
    event: TrackedEnvelope<unknown>,
  ) {
    const send = (message: ServerMessage) =>
      Effect.sync(() => {
        if (socket.readyState === OPEN) socket.send(JSON.stringify(message));
      });
    const request = requestOf(attachment);
    const report = (err: AnyTrpcError) => {
      core.report(err, request, sub.p, 'subscription');
      return toWireError(core.publicError(err));
    };
    const exit = yield* Effect.exit(
      Effect.flatMap(resolveProcedureEffect(core.router, sub.p), (procedure) =>
        procedure
          ? emitEvents(
              procedureEvents(procedure, Stream.make(event)),
              core.serializer,
              (cause) =>
                report(isTrpcError(cause) ? cause : unexpectedError(cause)),
              (frame) => send(frameMessage(sub.c, frame)),
            )
          : Effect.void,
      ),
    );
    if (Exit.isFailure(exit)) {
      const err = normalizeCause(exit.cause);
      yield* send({
        id: sub.c,
        type: 'error',
        body: core.serializer.serialize(report(err)),
      });
      unpark(socket, sub.c);
    }
  });

  /**
   * Sends a published event to the sockets parked on its channel, from a
   * fiber the object owns: a publisher interrupted while it waits doesn't
   * stop the delivery.
   */
  const deliver: Deliver = (key, channel, event) =>
    Effect.suspend(() => {
      const targets = (opts.state.getWebSockets?.() ?? []).flatMap((socket) => {
        const attachment = current(socket);
        return attachment
          ? (attachment.subs ?? [])
              .filter((s) => s.k === key && s.ch === channel)
              .map((sub) => [socket, attachment, sub] as const)
          : [];
      });
      return Fiber.join(
        run(
          Effect.forEach(
            targets,
            ([socket, attachment, sub]) =>
              sendEvent(socket, attachment, sub, tracked(event.id, event.data)),
            { concurrency: 'unbounded', discard: true },
          ),
        ),
      );
    });

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
        return Promise.reject(
          new TypeError('upgrade() needs WebSocketPair (Cloudflare Workers)'),
        );
      }
      const accepted = Effect.sync(() => {
        const { 0: client, 1: server } = new WebSocketPair();
        sockets.accept(server, request, ...platform);
        return HttpServerResponse.raw(
          new Response(null, {
            status: 101,
            webSocket: client,
          } as ResponseInit),
        );
      });
      return HttpEffect.toWebHandler(withMiddleware(middleware, accepted))(
        request,
      );
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
      run(Effect.asVoid(receiverFor(socket, platform[0])));
    },
    message(socket, data, ...platform) {
      run(
        Effect.flatMap(receiverFor(socket, platform[0]), (receiver) =>
          receiver
            ? receiver.receive(parseSocketMessage(data))
            : Effect.sync(() => socket.close(1011, 'Not a tRPC socket')),
        ),
      );
    },
    close(socket, code, reason) {
      const served = receivers.get(socket);
      receivers.delete(socket);
      if (served) run(Scope.close(served.scope, Exit.void));
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
