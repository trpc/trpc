import type { AnyTRPCRouter } from '@trpc/server';
import type { BehaviorSubject } from '@trpc/server/observable';
import { behaviorSubject, observable } from '@trpc/server/observable';
import type {
  CombinedDataTransformer,
  TRPCClientIncomingMessage,
  TRPCClientIncomingRequest,
  TRPCClientOutgoingMessage,
  TRPCResponseMessage,
} from '@trpc/server/unstable-core-do-not-import';
import {
  run,
  sleep,
  transformResult,
} from '@trpc/server/unstable-core-do-not-import';
import { TRPCClientError } from '../../../TRPCClientError';
import type { TRPCConnectionState } from '../../internals/subscriptions';
import type { Operation, OperationResultEnvelope } from '../../types';
import type { Encoder } from './encoder';
import { jsonEncoder } from './encoder';
import type { WebSocketClientOptions } from './options';
import { exponentialBackoff, keepAliveDefaults, lazyDefaults } from './options';
import type { TCallbacks } from './requestManager';
import { RequestManager } from './requestManager';
import {
  callUserCallback,
  ResettableTimeout,
  TRPCWebSocketClosedError,
} from './utils';
import type { WebSocketConnectionOptions } from './wsConnection';
import { backwardCompatibility, sendPing, WsConnection } from './wsConnection';

/**
 * A WebSocket client for managing TRPC operations, supporting lazy initialization,
 * reconnection, keep-alive, and request management.
 */
export class WsClient {
  /**
   * Observable tracking the current connection state, including errors.
   */
  public readonly connectionState: BehaviorSubject<
    TRPCConnectionState<TRPCClientError<AnyTRPCRouter>>
  >;

  private allowReconnect = false;
  private requestManager = new RequestManager();
  /**
   * The last id sent on the wire. Each request gets its own instead of its
   * `op.id`: a retry reuses the failed attempt's `op.id`, and the server's
   * late frames for that attempt must not reach the retry. A subscription
   * sent again after its socket was lost gets a new one for the same reason.
   */
  private lastRequestId = 0;
  private readonly connectionOptions: WebSocketConnectionOptions;
  /**
   * The connection new requests are sent on. A reconnect replaces it only
   * once the new connection is fully open, `connectionParams` included, so
   * until then requests keep going to the old one.
   */
  private activeConnection: WsConnection;
  private readonly reconnectRetryDelay: (attemptIndex: number) => number;
  private inactivityTimeout: ResettableTimeout;
  private readonly callbacks: Pick<
    WebSocketClientOptions,
    'onOpen' | 'onClose' | 'onError'
  >;
  private readonly lazyMode: boolean;
  private readonly encoder: Encoder;

  constructor(opts: WebSocketClientOptions) {
    this.encoder = opts.experimental_encoder ?? jsonEncoder;
    // Initialize callbacks, connection parameters, and options.
    this.callbacks = {
      onOpen: opts.onOpen,
      onClose: opts.onClose,
      onError: opts.onError,
    };

    const lazyOptions = {
      ...lazyDefaults,
      ...opts.lazy,
    };

    // Set up inactivity timeout for lazy connections.
    this.inactivityTimeout = new ResettableTimeout(() => {
      if (
        this.requestManager.hasOutgoingRequests() ||
        this.requestManager.hasPendingRequests()
      ) {
        this.inactivityTimeout.reset();
        return;
      }

      this.close().catch(() => null);
    }, lazyOptions.closeMs);

    // Initialize the WebSocket connection.
    this.connectionOptions = {
      WebSocketPonyfill: opts.WebSocket,
      urlOptions: opts,
      keepAlive: {
        ...keepAliveDefaults,
        ...opts.keepAlive,
      },
      encoder: this.encoder,
    };
    this.activeConnection = this.createConnection();
    this.reconnectRetryDelay = opts.retryDelayMs ?? exponentialBackoff;

    this.lazyMode = lazyOptions.enabled;

    this.connectionState = behaviorSubject<
      TRPCConnectionState<TRPCClientError<AnyTRPCRouter>>
    >({
      type: 'state',
      state: lazyOptions.enabled ? 'idle' : 'connecting',
      error: null,
    });

    // Automatically open the connection if lazy mode is disabled.
    if (!this.lazyMode) {
      this.open().catch(() => null);
    }
  }

  private createConnection() {
    const connection = new WsConnection(this.connectionOptions);
    connection.wsObservable.subscribe({
      next: (ws) => {
        if (!ws) return;
        this.setupWebSocketListeners(ws);
      },
    });
    return connection;
  }

  /**
   * Opens the WebSocket connection. Handles reconnection attempts and updates
   * the connection state accordingly.
   */
  private async open() {
    this.allowReconnect = true;
    if (this.reconnecting) return this.reconnecting;
    this.connectionAttemptIndex = 0;
    if (this.connectionState.get().state === 'idle') {
      callUserCallback(() =>
        this.connectionState.next({
          type: 'state',
          state: 'connecting',
          error: null,
        }),
      );
    }

    try {
      await this.activeConnection.open();
    } catch (error) {
      this.reconnect(
        new TRPCWebSocketClosedError({
          message: 'Initialization error',
          cause: error,
        }),
      );
      // A socket whose `connectionParams` failed is open, but not usable.
      await this.activeConnection.close().catch(() => null);
      return this.reconnecting;
    }
  }

  /**
   * Closes the WebSocket connection and stops managing requests.
   * Ensures all outgoing and pending requests are properly finalized.
   */
  public async close() {
    this.allowReconnect = false;
    this.replacementError = null;
    this.retiredConnection = null;
    this.inactivityTimeout.stop();

    const requestsToAwait: Promise<void>[] = [];
    for (const request of this.requestManager.getRequests()) {
      if (request.message.method === 'subscription') {
        callUserCallback(() => request.callbacks.complete());
      } else if (request.state === 'outgoing') {
        callUserCallback(() =>
          request.callbacks.error(
            TRPCClientError.from(
              new TRPCWebSocketClosedError({
                message: 'Closed before connection was established',
              }),
            ),
          ),
        );
      } else {
        requestsToAwait.push(request.end);
      }
    }

    await Promise.all(requestsToAwait).catch(() => null);
    this.nextConnection?.ws?.close();
    await this.activeConnection.close().catch(() => null);

    callUserCallback(() =>
      this.connectionState.next({
        type: 'state',
        state: 'idle',
        error: null,
      }),
    );
  }

  /**
   * Method to request the server.
   * Handles data transformation, batching of requests, and subscription lifecycle.
   *
   * @param op - The operation details including type, path, input and signal. Each subscription to the returned observable is sent with a new id, not `op.id`.
   * @param transformer - Data transformer for serializing requests and deserializing responses
   * @param lastEventId - Optional ID of the last received event for subscriptions
   *
   * @returns An observable that emits operation results and handles cleanup
   */
  public request({
    op: { type, path, input, signal },
    transformer,
    lastEventId,
  }: {
    op: Pick<Operation, 'id' | 'type' | 'path' | 'input' | 'signal'>;
    transformer: CombinedDataTransformer;
    lastEventId?: string;
  }) {
    return observable<
      OperationResultEnvelope<unknown, TRPCClientError<AnyTRPCRouter>>,
      TRPCClientError<AnyTRPCRouter>
    >((observer) => {
      const message: TRPCClientOutgoingMessage = {
        id: ++this.lastRequestId,
        method: type,
        params: {
          input: transformer.input.serialize(input),
          path,
          lastEventId,
        },
      };
      const abort = this.batchSend(message, {
        ...observer,
        next(event) {
          const transformed = transformResult(event, transformer.output);

          if (!transformed.ok) {
            observer.error(TRPCClientError.from(transformed.error));
            return;
          }

          observer.next({
            result: transformed.result,
          });
        },
      });

      const onAbort = () => observer.complete();
      if (signal?.aborted) {
        onAbort();
      } else {
        signal?.addEventListener('abort', onAbort, { once: true });
      }

      return () => {
        // A subscription sent again after its socket was lost has a new id.
        const { id } = message;
        const pending = this.requestManager.getPendingRequest(id);
        abort();

        if (type === 'subscription' && pending) {
          this.stopSubscription(id, pending.ws);
          this.stopSubscription(id, pending.successor);
        }
        this.closeIfDrained(pending?.ws);
        this.closeIfDrained(pending?.movedFrom);

        signal?.removeEventListener('abort', onAbort);
      };
    });
  }

  /**
   * The current WebSocket and its state, or `null` when there is no socket.
   */
  public get connection() {
    return backwardCompatibility(
      this.activeConnection.ws
        ? this.activeConnection
        : (this.nextConnection ?? this.activeConnection),
    );
  }

  /**
   * Manages the reconnection process for the WebSocket using retry logic.
   * Ensures that only one reconnection attempt is active at a time by tracking the current
   * reconnection state in the `reconnecting` promise.
   */
  private reconnecting: Promise<void> | null = null;
  /**
   * The connection a reconnect is opening to replace the active one.
   */
  private nextConnection: WsConnection | null = null;
  /**
   * The connection the active one replaced, while it's open. If the active
   * one is lost first, this one serves every request again until the next.
   */
  private retiredConnection: WsConnection | null = null;
  /**
   * Why the latest attempt to replace a socket that's still open failed.
   * It's shown once that socket closes, since until then it serves every
   * request.
   */
  private replacementError: TRPCWebSocketClosedError | null = null;
  /**
   * The retry attempt that opened the current connection.
   */
  private connectionAttemptIndex = 0;
  /**
   * Set when the server rejects the current connection with an `id: null`
   * error, e.g. because `createContext` threw. The server closes the socket
   * right after, so the reconnect that follows carries on with the backoff
   * instead of starting over at attempt 0. Cleared again when the socket
   * receives a result, which proves the connection was accepted.
   * @see https://github.com/trpc/trpc/issues/4774
   */
  private connectionRejected = false;
  /** Subscriptions whose subscriber has seen `started`. */
  private readonly started = new WeakSet<TRPCClientOutgoingMessage>();

  /**
   * Opens a new connection, retrying until one opens. While the current
   * socket is open, it keeps serving every request, new ones included, until
   * the new one is fully open, `connectionParams` included.
   *
   * @param closedError - Why the current socket was lost, or `null` when it's
   * still open and serving requests, e.g. on a server-requested reconnect.
   */
  private reconnect(closedError: TRPCWebSocketClosedError | null) {
    if (!this.allowReconnect) {
      return;
    }

    if (closedError) {
      const error = this.replacementError ?? closedError;
      this.replacementError = null;
      callUserCallback(() =>
        this.connectionState.next({
          type: 'state',
          state: 'connecting',
          error: TRPCClientError.from(error),
        }),
      );
    }
    if (this.reconnecting) return;

    const tryReconnect = async (attemptIndex: number) => {
      try {
        await sleep(this.reconnectRetryDelay(attemptIndex));
        if (this.allowReconnect) {
          const previous = this.activeConnection;
          const next = this.createConnection();
          this.nextConnection = next;
          try {
            await next.open();
            // `open()` resolves even if the socket closed while its
            // `connectionParams` were pending.
            if (!next.isOpen()) {
              throw new Error('WebSocket closed before it was ready');
            }
          } catch (error) {
            await next.close().catch(() => null);
            throw error;
          } finally {
            this.nextConnection = null;
          }

          if (this.allowReconnect) {
            this.activeConnection = next;
            this.retiredConnection = previous.isOpen() ? previous : null;
            this.connectionAttemptIndex = attemptIndex;
            this.replacementError = null;
            this.handOff(previous.ws);
          } else {
            await next.close();
          }
        }
        this.reconnecting = null;
      } catch (error) {
        const closedError = new TRPCWebSocketClosedError({
          message: 'Initialization error',
          cause: error,
        });
        if (this.allowReconnect && this.activeConnection.isOpen()) {
          // The old socket keeps serving every request, so this is shown only
          // once it closes.
          this.replacementError = closedError;
        } else if (this.allowReconnect) {
          callUserCallback(() =>
            this.connectionState.next({
              type: 'state',
              state: 'connecting',
              error: TRPCClientError.from(closedError),
            }),
          );
        }
        await tryReconnect(attemptIndex + 1);
      }
    };

    this.reconnecting = tryReconnect(
      this.connectionRejected ? this.connectionAttemptIndex + 1 : 0,
    );
  }

  /**
   * Moves the pending subscriptions to the active socket, which has just
   * opened: each is resubscribed with the id of the last event it delivered.
   * A subscription whose old socket is still open keeps delivering from it
   * until the new socket confirms it with `started`; see `confirmMove()`.
   * Closes the previous socket once nothing is left on it.
   */
  private handOff(previous: WebSocket | null) {
    if (
      this.connectionState.get().state !== 'pending' &&
      this.activeConnection.isOpen()
    ) {
      callUserCallback(() =>
        this.connectionState.next({
          type: 'state',
          state: 'pending',
          error: null,
        }),
      );
    }

    const ws = this.activeConnection.ws;
    const subscriptions = this.requestManager
      .getPendingRequests()
      .filter(
        (request) =>
          request.message.method === 'subscription' && request.ws !== ws,
      );
    if (subscriptions.length) {
      this.send(subscriptions.map(({ message }) => message));
      for (const request of subscriptions) {
        // The socket it was moving to hasn't started it, and won't be used.
        this.stopSubscription(request.message.id, request.successor);
        if (request.ws && request.ws.readyState === request.ws.OPEN) {
          request.successor = ws;
          request.overlapEventIds = new Set();
        } else {
          // Its socket was lost, so it starts again.
          this.started.delete(request.message);
          request.ws = ws;
          request.successor = null;
        }
      }
    }
    this.closeIfDrained(previous);
  }

  /**
   * Completes a subscription's move once its new socket has confirmed it:
   * stops it on the old socket, whose later messages for it are dropped
   * apart from events without ids, and closes that socket once everything it
   * sent before the stop has arrived and nothing else is left on it.
   */
  private confirmMove(request: {
    message: TRPCClientOutgoingMessage;
    ws: WebSocket | null;
    successor: WebSocket | null;
    movedFrom: WebSocket | null;
  }) {
    const previous = request.ws;
    const earlier = request.movedFrom;
    request.ws = request.successor;
    request.successor = null;
    request.movedFrom = null;
    if (previous && this.stopSubscription(request.message.id, previous)) {
      request.movedFrom = previous;
      // `stopped` can wait on the procedure, but the "PONG" can't.
      sendPing(previous, () => this.releaseMovedFrom(request, previous));
    }
    this.closeIfDrained(earlier);
    this.closeIfDrained(previous);
  }

  private releaseMovedFrom(
    request: { movedFrom: WebSocket | null },
    ws: WebSocket,
  ) {
    if (request.movedFrom !== ws) return;
    request.movedFrom = null;
    this.closeIfDrained(ws);
  }

  private hasRequestsOn(ws: WebSocket | null) {
    return this.requestManager
      .getPendingRequests()
      .some((request) => request.ws === ws || request.movedFrom === ws);
  }

  /**
   * Closes `ws` once it's been replaced and nothing is left on it.
   */
  private closeIfDrained(ws: WebSocket | null | undefined) {
    if (!ws || ws === this.activeConnection.ws) return;
    if (this.hasRequestsOn(ws)) return;
    ws.close();
  }

  /**
   * Stops a subscription on the socket it was sent on, if that's still open.
   *
   * @returns Whether the stop was sent.
   */
  private stopSubscription(
    id: TRPCClientOutgoingMessage['id'],
    ws: WebSocket | null,
  ) {
    if (!ws || ws.readyState !== ws.OPEN) return false;
    ws.send(this.encoder.encode({ id, method: 'subscription.stop' }));
    return true;
  }

  /**
   * Fails the pending queries and mutations sent on `ws`, and returns its
   * pending subscriptions, which are kept to be sent again.
   */
  private failPendingRequests(ws: WebSocket, cause: unknown) {
    const subscriptions = [];
    for (const request of this.requestManager.getPendingRequests()) {
      const { message, callbacks } = request;
      if (request.ws !== ws) continue;
      if (message.method === 'subscription') {
        subscriptions.push(request);
        continue;
      }

      callUserCallback(() =>
        callbacks.error(
          TRPCClientError.from(
            cause ??
              new TRPCWebSocketClosedError({
                message: 'WebSocket closed',
                cause,
              }),
          ),
        ),
      );
      this.requestManager.delete(message);
    }
    return subscriptions;
  }

  private setupWebSocketListeners(ws: WebSocket) {
    this.connectionRejected = false;

    /**
     * Fails the queries and mutations sent on `ws`. Its subscriptions are
     * sent again: by `reconnect()`, or, if `ws` was replaced without one, on
     * the active socket.
     */
    const handleCloseOrError = (cause: unknown) => {
      if (ws === this.retiredConnection?.ws) this.retiredConnection = null;
      const retired = this.retiredConnection;
      let restored = false;
      if (ws === this.activeConnection.ws && retired?.isOpen()) {
        restored = true;
        // The socket it replaced serves every request again, until the next
        // one opens.
        this.activeConnection = retired;
        this.retiredConnection = null;
        this.replacementError = new TRPCWebSocketClosedError({
          message: 'WebSocket closed',
          cause,
        });
      }
      for (const request of this.requestManager.getPendingRequests()) {
        if (request.successor === ws) {
          // Its old socket still has it.
          request.successor = null;
          request.overlapEventIds = null;
        }
        if (request.movedFrom === ws) request.movedFrom = null;
      }
      const lost = this.failPendingRequests(ws, cause).filter((request) => {
        if (!request.successor) return true;
        // Its new socket has it already.
        request.ws = request.successor;
        request.successor = null;
        return false;
      });
      if (ws === this.activeConnection.ws || this.reconnecting) return;

      for (const { message, callbacks } of lost) {
        this.started.delete(message);
        // The active socket may still have its old id, e.g. while stopping it.
        this.requestManager.requeue(message, ++this.lastRequestId);
        this.flushOutgoing(message, callbacks);
      }
      if (restored) this.reconnect(null);
    };

    ws.addEventListener('open', () => {
      run(async () => {
        if (this.lazyMode) {
          this.inactivityTimeout.start();
        }

        this.callbacks.onOpen?.();

        // A socket opened to replace one that's still open changes nothing
        // the subscribers can see until `handOff()` puts it in use.
        if (
          this.connectionState.get().state === 'pending' ||
          (ws !== this.activeConnection.ws && this.activeConnection.isOpen())
        ) {
          return;
        }
        callUserCallback(() =>
          this.connectionState.next({
            type: 'state',
            state: 'pending',
            error: null,
          }),
        );
      }).catch((error) => {
        ws.close(3000);
        handleCloseOrError(error);
      });
    });

    const onMessage = ({ data }: MessageEvent) => {
      this.inactivityTimeout.reset();

      // Handle PING/PONG as text regardless of encoder
      if (['PING', 'PONG'].includes(data)) return;

      const incomingMessage = this.encoder.decode(
        data,
      ) as TRPCClientIncomingMessage;
      if ('method' in incomingMessage) {
        if (ws === this.activeConnection.ws) {
          this.handleIncomingRequest(incomingMessage);
        }
        return;
      }

      // A replaced socket still answers its own queries and mutations, but
      // says nothing about the connection the client now uses.
      const isRetired =
        ws !== this.activeConnection.ws && ws !== this.nextConnection?.ws;
      if (
        !isRetired &&
        incomingMessage.id === null &&
        'error' in incomingMessage
      ) {
        this.connectionRejected = true;
      } else if (!isRetired && 'result' in incomingMessage) {
        // The server only sends results once `createContext` has succeeded,
        // so an earlier `id: null` error on this socket was not a rejection,
        // e.g. the server's reply to a malformed frame.
        this.connectionRejected = false;
      }

      this.handleResponseMessage(incomingMessage, ws);
    };
    // With `ws`, a throw from a `message` listener stops the socket from
    // reading any further frames while it stays open.
    ws.addEventListener('message', (event) => {
      callUserCallback(() => onMessage(event));
    });

    ws.addEventListener('close', (event) => {
      handleCloseOrError(event);
      callUserCallback(() => this.callbacks.onClose?.(event));

      if (
        ws === this.activeConnection.ws &&
        (!this.lazyMode || this.requestManager.hasPendingSubscriptions())
      ) {
        this.reconnect(
          new TRPCWebSocketClosedError({
            message: 'WebSocket closed',
            cause: event,
          }),
        );
      }
    });

    ws.addEventListener('error', (event) => {
      handleCloseOrError(event);
      callUserCallback(() => this.callbacks.onError?.(event));

      if (ws !== this.activeConnection.ws) return;

      this.reconnect(
        new TRPCWebSocketClosedError({
          message: 'WebSocket closed',
          cause: event,
        }),
      );
    });
  }

  private handleResponseMessage(message: TRPCResponseMessage, ws: WebSocket) {
    const request = this.requestManager.getPendingRequest(message.id);
    if (!request) return;
    const result = 'result' in message ? message.result : null;
    if (request.successor === ws) {
      this.confirmMove(request);
    } else if (request.ws !== ws) {
      // A subscription moved to a new socket ignores the old one's frames,
      // apart from events without ids until it's stopped there: those can't
      // be replayed, and the new socket may have started listening after
      // the old one sent them.
      if (ws === request.movedFrom) {
        if (result?.type === 'stopped') {
          this.releaseMovedFrom(request, ws);
        } else if (result?.type === 'data' && result.id === undefined) {
          callUserCallback(() => request.callbacks.next(message));
        }
      }
      return;
    }
    // The subscriber doesn't see a move, even one its old socket didn't
    // live to finish.
    if (result?.type === 'started' && this.started.has(request.message)) {
      return;
    }

    if (result?.type === 'data' && result.id !== undefined) {
      const eventId = String(result.id);
      if (request.successor) {
        request.overlapEventIds?.add(eventId);
      } else if (request.overlapEventIds?.delete(eventId)) {
        // Already delivered by the old socket.
        return;
      }
    }

    callUserCallback(() => request.callbacks.next(message));

    let completed = true;
    if ('result' in message && request.message.method === 'subscription') {
      if (message.result.type === 'data') {
        request.message.params.lastEventId = message.result.id;
      } else if (message.result.type === 'started') {
        this.started.add(request.message);
      }

      if (message.result.type !== 'stopped') {
        completed = false;
      }
    }

    if (completed) {
      callUserCallback(() => request.callbacks.complete());
      this.requestManager.delete(request.message);
    }
  }

  private handleIncomingRequest(message: TRPCClientIncomingRequest) {
    if (message.method === 'reconnect') {
      this.reconnect(null);
    }
  }

  /**
   * Sends a message or batch of messages directly to the server.
   */
  private send(
    messageOrMessages: TRPCClientOutgoingMessage | TRPCClientOutgoingMessage[],
  ) {
    if (!this.activeConnection.isOpen()) {
      throw new Error('Active connection is not open');
    }

    const messages =
      messageOrMessages instanceof Array
        ? messageOrMessages
        : [messageOrMessages];
    this.activeConnection.ws.send(
      this.encoder.encode(messages.length === 1 ? messages[0] : messages),
    );
  }

  /**
   * Groups requests for batch sending.
   *
   * @returns A function to abort the batched request.
   */
  private batchSend(message: TRPCClientOutgoingMessage, callbacks: TCallbacks) {
    this.inactivityTimeout.reset();
    this.flushOutgoing(message, callbacks);
    return this.requestManager.register(message, callbacks);
  }

  /**
   * Sends `message` with the other outgoing requests once the connection is
   * open, batching those queued in the same tick.
   */
  private flushOutgoing(
    message: TRPCClientOutgoingMessage,
    callbacks: TCallbacks,
  ) {
    run(async () => {
      // During a reconnect, requests go to the old socket while it's open.
      do {
        if (!this.activeConnection.isOpen()) {
          await this.open();
        }
        await sleep(0);
      } while (!this.activeConnection.isOpen() && this.reconnecting);

      if (!this.requestManager.hasOutgoingRequests()) return;
      // Another run already sent this request. Each queued request's own run
      // sends it once the new socket opens.
      if (
        !this.activeConnection.isOpen() &&
        !this.requestManager.isOutgoing(message)
      ) {
        return;
      }

      const requests = this.requestManager.flush(this.activeConnection.ws);
      try {
        this.send(requests.map((request) => request.message));
      } catch (err) {
        for (const request of requests) {
          this.requestManager.delete(request.message);
          callUserCallback(() =>
            request.callbacks.error(TRPCClientError.from(err as Error)),
          );
        }
      }
    }).catch((err) => {
      this.requestManager.delete(message);
      callUserCallback(() => callbacks.error(TRPCClientError.from(err)));
    });
  }
}
