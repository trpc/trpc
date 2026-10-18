import { Duration, Effect, Layer, Option } from 'effect';
import { Socket } from 'effect/socket';
import {
  experimental_Locker,
  experimental_LockTimeout,
  type experimental_LockOptions,
} from '../server/lock.ts';
import type { HibernatableWebSocket } from './hibernation.ts';

const TAG = 'trpc-lock';
const ACQUIRED = 'trpc-lock-acquired';
const OPEN = 1;

/**
 * The parts of `DurableObjectState` {@link experimental_durableLockObject} uses.
 * @since 0.1.0
 * @stability experimental
 */
export interface DurableLockState {
  acceptWebSocket(socket: never, tags?: string[]): void;
  getWebSockets(tag?: string): HibernatableWebSocket[];
}

/**
 * What {@link experimental_durableLockObject} returns. Call it from the
 * Durable Object's `fetch` and `webSocketClose` (and `webSocketError`).
 * @since 0.1.0
 * @stability experimental
 */
export interface DurableLockObject {
  fetch(request: Request): Response;
  /** Hands the lock to the oldest waiter when its holder's socket closes. */
  close(socket: HibernatableWebSocket): void;
}

const isHolder = (socket: HibernatableWebSocket) =>
  (socket.deserializeAttachment() as { lock?: string } | null)?.lock ===
  'holder';

/**
 * The Durable Object side of {@link experimental_durableLocker}: one object
 * per key. Each caller keeps a hibernatable WebSocket open while it holds or
 * waits for the lock, so the object isn't billed meanwhile and a crashed
 * holder's lock is released when its socket drops.
 *
 * @example
 * ```ts
 * export class Locks extends DurableObject {
 *   locks = experimental_durableLockObject(this.ctx);
 *   override fetch(request: Request) {
 *     return this.locks.fetch(request);
 *   }
 *   override webSocketClose(ws: WebSocket) {
 *     this.locks.close(ws);
 *   }
 * }
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export function experimental_durableLockObject(
  state: DurableLockState,
): DurableLockObject {
  return {
    fetch() {
      const WebSocketPair = (
        globalThis as {
          WebSocketPair?: new () => {
            0: HibernatableWebSocket;
            1: HibernatableWebSocket;
          };
        }
      ).WebSocketPair;
      if (!WebSocketPair) {
        throw new TypeError('durable locks need WebSocketPair (Workers)');
      }
      const held = state
        .getWebSockets(TAG)
        .some((ws) => ws.readyState === OPEN && isHolder(ws));
      const { 0: client, 1: server } = new WebSocketPair();
      server.serializeAttachment({ lock: held ? 'waiter' : 'holder' });
      state.acceptWebSocket(server as never, [TAG]);
      return new Response(null, {
        status: 101,
        webSocket: client,
        headers: held ? {} : { [ACQUIRED]: '1' },
      } as ResponseInit);
    },
    close(socket) {
      try {
        socket.close(1000, 'released');
      } catch {
        // Already closed.
      }
      if (!isHolder(socket)) return;
      socket.serializeAttachment({ lock: 'released' });
      const sockets = state.getWebSockets(TAG); // newest first
      for (let i = sockets.length - 1; i >= 0; i--) {
        const next = sockets[i]!;
        if (next === socket || next.readyState !== OPEN) continue;
        if (isHolder(next)) return;
        next.serializeAttachment({ lock: 'holder' });
        next.send('acquired');
        return;
      }
    },
  };
}

/**
 * The client end of a lock's WebSocket, as a Durable Object stub's
 * `fetch` returns it: a `WebSocket` that is `accept()`ed before use.
 * @since 0.1.0
 * @stability experimental
 */
export interface DurableLockSocket extends Socket.WebSocketLike {
  accept(): void;
}

/**
 * The parts of a `DurableObjectNamespace` {@link experimental_durableLocker} uses.
 * @since 0.1.0
 * @stability experimental
 */
export interface DurableLockNamespace {
  getByName(name: string): {
    fetch(
      input: string,
      init: { headers: Record<string, string> },
    ): Promise<{
      readonly status: number;
      readonly headers: { has(name: string): boolean };
      readonly webSocket?: DurableLockSocket | null;
    }>;
  };
}

/**
 * Options for {@link experimental_durableLocker}.
 * @since 0.1.0
 * @stability experimental
 */
export interface experimental_DurableLockerOptions extends experimental_LockOptions {
  /** Prefixes object names. @default '' */
  readonly prefix?: string;
}

/**
 * An `experimental_Locker` on Durable Objects: each key is an object running
 * {@link experimental_durableLockObject}, so every Worker instance shares the
 * lock. Waiters are told when it's their turn; nothing polls.
 *
 * @example
 * ```ts
 * createFetchHandler({ router, layer: experimental_durableLocker(env.LOCKS) });
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export function experimental_durableLocker(
  namespace: DurableLockNamespace,
  options: experimental_DurableLockerOptions = {},
): Layer.Layer<experimental_Locker> {
  const prefix = options.prefix ?? '';
  return Layer.succeed(experimental_Locker, {
    acquire: (key, opts) =>
      Effect.gen(function* () {
        const ttl = Duration.fromInputUnsafe(
          opts?.ttl ?? options.ttl ?? '30 seconds',
        );
        const timeout = Duration.fromInputUnsafe(
          opts?.timeout ?? options.timeout ?? '10 seconds',
        );
        const response = yield* Effect.promise(() =>
          namespace.getByName(prefix + key).fetch('https://lock/acquire', {
            headers: { upgrade: 'websocket' },
          }),
        );
        const socket = response.webSocket;
        if (!socket) {
          return yield* Effect.die(
            new Error(`The lock object answered ${response.status}`),
          );
        }
        socket.accept();
        const lost = () =>
          Effect.die(new Error('The lock object closed the socket'));
        const effectSocket = yield* Socket.fromWebSocket(
          Effect.succeed(socket),
        );
        const reader = yield* Effect.catch(effectSocket.reader, lost);
        const writer = yield* effectSocket.writer;
        const close = (reason: string) =>
          Effect.ignore(writer.write(new Socket.CloseEvent(1000, reason)));
        yield* Effect.addFinalizer(() => close('released'));
        const waited = !response.headers.has(ACQUIRED);
        if (waited) {
          const granted = yield* Effect.timeoutOption(
            Effect.catch(reader.pull, lost),
            timeout,
          );
          if (Option.isNone(granted)) {
            return yield* new experimental_LockTimeout({ key });
          }
        }
        yield* Effect.forkScoped(
          Effect.andThen(Effect.sleep(ttl), close('expired')),
        );
        return { waited };
      }),
  });
}
