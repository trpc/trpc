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
import { backwardCompatibility, WsConnection } from './wsConnection';

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
   * late frames for that attempt must not reach the retry.
   */
  private lastRequestId = 0;
  private readonly connectionOptions: WebSocketConnectionOptions;
  /**
   * The connection new requests are sent on. A reconnect replaces it only
   * once the new connection is fully open, `connectionParams` included.
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
      return this.reconnecting;
    }
  }

  /**
   * Closes the WebSocket connection and stops managing requests.
   * Ensures all outgoing and pending requests are properly finalized.
   */
  public async close() {
    this.allowReconnect = false;
    this.inactivityTimeout.stop();

    const requestsToAwait: Promise<void>[] = [];
    for (const request of this.requestManager.getRequests()) {
      if (request.message.method === 'subscription') {
        request.callbacks.complete();
      } else if (request.state === 'outgoing') {
        request.callbacks.error(
          TRPCClientError.from(
            new TRPCWebSocketClosedError({
              message: 'Closed before connection was established',
            }),
          ),
        );
      } else {
        requestsToAwait.push(request.end);
      }
    }

    await Promise.all(requestsToAwait).catch(() => null);
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
      const id = ++this.lastRequestId;
      const abort = this.batchSend(
        {
          id,
          method: type,
          params: {
            input: transformer.input.serialize(input),
            path,
            lastEventId,
          },
        },
        {
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
        },
      );

      const onAbort = () => observer.complete();
      if (signal?.aborted) {
        onAbort();
      } else {
        signal?.addEventListener('abort', onAbort, { once: true });
      }

      return () => {
        const pending = this.requestManager.getPendingRequest(id);
        abort();

        if (type === 'subscription' && pending) {
          this.stopSubscription(id, pending.ws);
        }
        this.closeIfDrained(pending?.ws);

        signal?.removeEventListener('abort', onAbort);
      };
    });
  }

  /**
   * The current WebSocket and its state, or `null` when there is no socket.
   */
  public get connection() {
    return backwardCompatibility(this.activeConnection);
  }

  /**
   * Manages the reconnection process for the WebSocket using retry logic.
   * Ensures that only one reconnection attempt is active at a time by tracking the current
   * reconnection state in the `reconnecting` promise.
   */
  private reconnecting: Promise<void> | null = null;
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
  /**
   * Subscriptions resubscribed while their old socket was still open. The
   * subscriber already saw them start, so the new socket's `started` is
   * dropped.
   */
  private readonly handedOff = new WeakSet<TRPCClientOutgoingMessage>();

  /**
   * Opens a new connection, retrying until one opens. Requests in flight on
   * the current socket keep it open, and keep being served by it, until the
   * new one is fully open, `connectionParams` included.
   *
   * @param closedError - Why the current socket was lost, or `null` when it's
   * still open and serving requests, e.g. on a server-requested reconnect.
   */
  private reconnect(closedError: TRPCWebSocketClosedError | null) {
    if (!this.allowReconnect) {
      return;
    }

    if (closedError) {
      callUserCallback(() =>
        this.connectionState.next({
          type: 'state',
          state: 'connecting',
          error: TRPCClientError.from(closedError),
        }),
      );
    }
    if (this.reconnecting) return;

    const tryReconnect = async (attemptIndex: number, isFirst: boolean) => {
      try {
        await sleep(this.reconnectRetryDelay(attemptIndex));
        if (this.allowReconnect) {
          // Only a socket that had nothing on it when the reconnect began is
          // closed before its replacement opens.
          const previous = this.activeConnection;
          if (isFirst && !this.hasRequestsOn(previous.ws)) {
            await previous.close();
          }

          const next = this.createConnection();
          try {
            await next.open();
          } catch (error) {
            await next.close().catch(() => null);
            throw error;
          }

          if (this.allowReconnect) {
            this.activeConnection = next;
            this.connectionAttemptIndex = attemptIndex;
            this.handOff(previous.ws);
          } else {
            await next.close();
          }
        }
        this.reconnecting = null;
      } catch (error) {
        // While the old socket is open, it keeps serving requests, so a
        // failed attempt to replace it isn't surfaced.
        if (this.allowReconnect && !this.activeConnection.isOpen()) {
          callUserCallback(() =>
            this.connectionState.next({
              type: 'state',
              state: 'connecting',
              error: TRPCClientError.from(
                new TRPCWebSocketClosedError({
                  message: 'Initialization error',
                  cause: error,
                }),
              ),
            }),
          );
        }
        await tryReconnect(attemptIndex + 1, false);
      }
    };

    this.reconnecting = tryReconnect(
      this.connectionRejected ? this.connectionAttemptIndex + 1 : 0,
      true,
    );
  }

  /**
   * Moves the pending subscriptions to the active socket, which has just
   * opened: each is resubscribed with the id of the last event it delivered,
   * then stopped on its old socket, whose later messages for it are dropped.
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
    const retired = new Set([previous]);
    if (subscriptions.length) {
      this.send(subscriptions.map(({ message }) => message));
      for (const request of subscriptions) {
        if (this.stopSubscription(request.message.id, request.ws)) {
          this.handedOff.add(request.message);
        }
        retired.add(request.ws);
        request.ws = ws;
      }
    }
    for (const socket of retired) {
      this.closeIfDrained(socket);
    }
  }

  private hasRequestsOn(ws: WebSocket | null) {
    return this.requestManager
      .getPendingRequests()
      .some((request) => request.ws === ws);
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
      const lost = this.failPendingRequests(ws, cause);
      if (ws === this.activeConnection.ws || this.reconnecting) return;

      for (const { message, callbacks } of lost) {
        this.requestManager.requeue(message);
        this.flushOutgoing(message, callbacks);
      }
    };

    ws.addEventListener('open', () => {
      run(async () => {
        if (this.lazyMode) {
          this.inactivityTimeout.start();
        }

        this.callbacks.onOpen?.();

        // A socket opened to replace one that's still open changes nothing
        // the subscribers can see.
        if (this.connectionState.get().state === 'pending') return;
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

    ws.addEventListener('message', ({ data }) => {
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

      if (incomingMessage.id === null && 'error' in incomingMessage) {
        this.connectionRejected = true;
      } else if ('result' in incomingMessage) {
        // The server only sends results once `createContext` has succeeded,
        // so an earlier `id: null` error on this socket was not a rejection,
        // e.g. the server's reply to a malformed frame.
        this.connectionRejected = false;
      }

      this.handleResponseMessage(incomingMessage, ws);
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
    // A subscription moved to a new socket ignores the old one's late frames.
    if (request?.ws !== ws) return;
    if (
      'result' in message &&
      message.result.type === 'started' &&
      this.handedOff.delete(request.message)
    ) {
      return;
    }

    request.callbacks.next(message);

    let completed = true;
    if ('result' in message && request.message.method === 'subscription') {
      if (message.result.type === 'data') {
        request.message.params.lastEventId = message.result.id;
      }

      if (message.result.type !== 'stopped') {
        completed = false;
      }
    }

    if (completed) {
      request.callbacks.complete();
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
      // During a reconnect, requests wait for the new socket rather than
      // going to the old one.
      do {
        if (this.reconnecting) {
          await this.reconnecting;
        } else if (!this.activeConnection.isOpen()) {
          await this.open();
        }
        await sleep(0);
      } while (this.reconnecting);

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
      callbacks.error(TRPCClientError.from(err));
    });
  }
}
