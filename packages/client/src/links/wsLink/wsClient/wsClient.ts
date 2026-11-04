import type { AnyTRPCRouter } from '@trpc/server';
import type { BehaviorSubject } from '@trpc/server/observable';
import { behaviorSubject, observable } from '@trpc/server/observable';
import type {
  CombinedDataTransformer,
  TRPCClientIncomingMessage,
  TRPCClientOutgoingMessage,
} from '@trpc/server/unstable-core-do-not-import';
import {
  getCauseFromUnknown,
  isObject,
  transformResult,
} from '@trpc/server/unstable-core-do-not-import';
import { TRPCClientError } from '../../../TRPCClientError';
import type { TRPCConnectionState } from '../../internals/subscriptions';
import type { Operation, OperationResultEnvelope } from '../../types';
import type { Encoder } from './encoder';
import { jsonEncoder } from './encoder';
import type { KeepAliveOptions, WebSocketClientOptions } from './options';
import { exponentialBackoff, keepAliveDefaults, lazyDefaults } from './options';
import type { Request } from './requestManager';
import { RequestManager } from './requestManager';
import {
  callUserCallback,
  rethrowAsync,
  ResettableTimeout,
  TRPCWebSocketClosedError,
} from './utils';
import type { ConnectionEvents } from './wsConnection';
import { backwardCompatibility, Connection } from './wsConnection';

type ConnectionState = TRPCConnectionState<TRPCClientError<AnyTRPCRouter>>;

/**
 * The client's lifecycle. Exactly one connection is current at a time; the
 * connections it replaced drain on their own (see `draining`).
 */
type Lifecycle =
  /** No connection, and none is wanted: lazy and unused, or after `close()`. */
  | { kind: 'idle' }
  /** Waiting `retryDelayMs(retryIndex)` before opening the next connection. */
  | {
      kind: 'backoff';
      retryIndex: number;
      timer: ReturnType<typeof setTimeout>;
    }
  /** `connection` is opening. Requests queue until it's ready. */
  | { kind: 'connecting'; connection: Connection }
  /** `connection` is ready, and requests are sent on it. */
  | { kind: 'open'; connection: Connection };

/**
 * A WebSocket client for managing TRPC operations, supporting lazy initialization,
 * reconnection, keep-alive, and request management.
 *
 * It supervises one current connection and any it replaced. A request is sent
 * on the current connection once it's ready, and only that connection's frames
 * reach it. When a connection is lost, its queries and mutations fail and its
 * subscriptions are queued again. When the server asks to reconnect, the old
 * connection drains: its queries and mutations finish there, and its
 * subscriptions move once the new connection is ready.
 */
export class WsClient {
  /**
   * Observable tracking the current connection state, including errors.
   */
  public readonly connectionState: BehaviorSubject<ConnectionState>;

  private lifecycle: Lifecycle = { kind: 'idle' };
  /** Connections replaced while requests were still in flight on them. */
  private readonly draining = new Set<Connection>();
  private readonly requestManager = new RequestManager();
  /**
   * The last id sent on the wire. Each request gets its own instead of its
   * `op.id`: a retry reuses the failed attempt's `op.id`, and the server's
   * late frames for that attempt must not reach the retry.
   */
  private lastRequestId = 0;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly inactivityTimeout: ResettableTimeout;

  private readonly WebSocketPonyfill: typeof WebSocket;
  private readonly urlOptions: WebSocketClientOptions;
  private readonly keepAlive: KeepAliveOptions;
  private readonly retryDelayMs: (attemptIndex: number) => number;
  private readonly callbacks: Pick<
    WebSocketClientOptions,
    'onOpen' | 'onClose' | 'onError'
  >;
  private readonly lazyMode: boolean;
  private readonly encoder: Encoder;
  private readonly connectionEvents: ConnectionEvents;

  constructor(opts: WebSocketClientOptions) {
    const WebSocketPonyfill = opts.WebSocket ?? globalThis.WebSocket;
    if (!WebSocketPonyfill) {
      throw new Error(
        "No WebSocket implementation found - you probably don't want to use this on the server, but if you do you need to pass a `WebSocket`-ponyfill",
      );
    }
    this.WebSocketPonyfill = WebSocketPonyfill;
    this.urlOptions = opts;
    this.encoder = opts.experimental_encoder ?? jsonEncoder;
    this.keepAlive = { ...keepAliveDefaults, ...opts.keepAlive };
    this.retryDelayMs = opts.retryDelayMs ?? exponentialBackoff;
    this.callbacks = {
      onOpen: opts.onOpen,
      onClose: opts.onClose,
      onError: opts.onError,
    };

    const lazyOptions = { ...lazyDefaults, ...opts.lazy };
    this.lazyMode = lazyOptions.enabled;
    this.inactivityTimeout = new ResettableTimeout(() => {
      if (!this.requestManager.isEmpty()) {
        this.inactivityTimeout.reset();
        return;
      }
      this.close().catch(() => null);
    }, lazyOptions.closeMs);

    this.connectionEvents = {
      onSocketOpen: () => callUserCallback(() => this.callbacks.onOpen?.()),
      onReady: (connection) => this.onReady(connection),
      onOpenFailed: (connection, cause) => {
        this.onConnectionLost(connection, cause);
        this.afterConnectionLost(connection, cause);
      },
      onMessage: (connection, message) => this.onMessage(connection, message),
      onSocketClose: (connection, event, cause) => {
        this.onConnectionLost(connection, cause);
        callUserCallback(() => this.callbacks.onClose?.(event));
        this.afterConnectionLost(connection, cause);
      },
      onSocketError: (connection, event) => {
        this.onConnectionLost(connection, event);
        callUserCallback(() => this.callbacks.onError?.(event));
        this.afterConnectionLost(connection, event);
      },
    };

    this.connectionState = behaviorSubject<ConnectionState>({
      type: 'state',
      state: this.lazyMode ? 'idle' : 'connecting',
      error: null,
    });

    if (!this.lazyMode) {
      this.connect(null);
    }
  }

  /**
   * Closes the WebSocket connection and stops managing requests.
   * Subscriptions complete, requests not sent yet fail, and the ones in flight
   * finish before the connection closes.
   */
  public async close() {
    this.inactivityTimeout.stop();
    this.stopFlushTimer();
    const lifecycle = this.lifecycle;
    this.lifecycle = { kind: 'idle' };
    if (lifecycle.kind === 'backoff') {
      clearTimeout(lifecycle.timer);
    } else if (lifecycle.kind === 'connecting') {
      lifecycle.connection.close();
    } else if (lifecycle.kind === 'open') {
      lifecycle.connection.drain();
      this.draining.add(lifecycle.connection);
    }

    const requestsToAwait: Promise<void>[] = [];
    for (const request of this.requestManager.all()) {
      if (request.message.method === 'subscription') {
        callUserCallback(() => request.callbacks.complete());
        this.requestManager.delete(request.message);
      } else if (request.state.kind === 'queued') {
        this.requestManager.delete(request.message);
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
    for (const connection of this.draining) {
      this.closeIfDrained(connection);
    }

    this.setState({ type: 'state', state: 'idle', error: null });
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
      const unregister = this.requestManager.register(message, {
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
      this.inactivityTimeout.reset();
      if (this.lifecycle.kind === 'backoff') {
        // A new request doesn't wait out the backoff.
        clearTimeout(this.lifecycle.timer);
        this.connect(this.lifecycle.retryIndex);
      }
      this.scheduleFlush();

      const onAbort = () => observer.complete();
      if (signal?.aborted) {
        onAbort();
      } else {
        signal?.addEventListener('abort', onAbort, { once: true });
      }

      return () => {
        const request = this.requestManager.get(message.id);
        const sentOn =
          request?.message === message && request.state.kind === 'sent'
            ? request.state.connection
            : null;
        unregister();

        if (sentOn && type === 'subscription') {
          sentOn.send(
            this.encoder.encode({
              id: message.id,
              method: 'subscription.stop',
            }),
          );
        }
        if (sentOn) this.closeIfDrained(sentOn);

        signal?.removeEventListener('abort', onAbort);
      };
    });
  }

  /**
   * The current WebSocket and its state, or `null` when there is no socket.
   * A socket the server asked to replace stays current until its replacement
   * is ready.
   */
  public get connection() {
    const lifecycle = this.lifecycle;
    if (lifecycle.kind === 'open') {
      return backwardCompatibility(lifecycle.connection);
    }
    const replaced = [...this.draining].at(-1);
    if (replaced) return backwardCompatibility(replaced);
    return backwardCompatibility(
      lifecycle.kind === 'connecting' ? lifecycle.connection : null,
    );
  }

  private setState(state: ConnectionState) {
    callUserCallback(() => this.connectionState.next(state));
  }

  private setConnecting(error: TRPCWebSocketClosedError | null) {
    this.setState({
      type: 'state',
      state: 'connecting',
      error: error && TRPCClientError.from(error),
    });
  }

  /**
   * Opens a new current connection.
   *
   * @param retryIndex - The `retryDelayMs` attempt index it follows, or
   * `null` when it isn't a retry.
   */
  private connect(retryIndex: number | null) {
    const connection = new Connection({
      WebSocketPonyfill: this.WebSocketPonyfill,
      urlOptions: this.urlOptions,
      keepAlive: this.keepAlive,
      encoder: this.encoder,
      events: this.connectionEvents,
      retryIndex,
    });
    this.lifecycle = { kind: 'connecting', connection };
    connection.start();
  }

  private scheduleReconnect(retryIndex: number) {
    let delayMs: number;
    try {
      delayMs = this.retryDelayMs(retryIndex);
    } catch (error) {
      rethrowAsync(error);
      delayMs = exponentialBackoff(retryIndex);
    }
    const timer = setTimeout(() => {
      if (this.lifecycle.kind === 'backoff' && this.lifecycle.timer === timer) {
        this.connect(retryIndex);
      }
    }, delayMs);
    this.lifecycle = { kind: 'backoff', retryIndex, timer };
  }

  private isCurrent(connection: Connection) {
    const lifecycle = this.lifecycle;
    return (
      (lifecycle.kind === 'connecting' || lifecycle.kind === 'open') &&
      lifecycle.connection === connection
    );
  }

  private onReady(connection: Connection) {
    if (!this.isCurrent(connection)) {
      connection.close();
      return;
    }
    this.lifecycle = { kind: 'open', connection };
    if (this.lazyMode) {
      this.inactivityTimeout.start();
    }
    const current = this.connectionState.get();
    if (current.state !== 'pending' || current.error !== null) {
      this.setState({ type: 'state', state: 'pending', error: null });
    }

    // Subscriptions move off the connections this one replaced only now, so
    // they're never without a connection that can deliver their events.
    for (const previous of this.draining) {
      for (const request of this.requestManager.sentOn(previous)) {
        if (request.message.method !== 'subscription') continue;
        previous.send(
          this.encoder.encode({
            id: request.message.id,
            method: 'subscription.stop',
          }),
        );
        this.requestManager.requeue(request, { hideStarted: true });
      }
      this.closeIfDrained(previous);
    }

    this.requestManager.batchFor(connection);
    this.flush();
  }

  private onMessage(
    connection: Connection,
    message: TRPCClientIncomingMessage,
  ) {
    this.inactivityTimeout.reset();

    if ('method' in message) {
      if (message.method === 'reconnect' && this.isCurrent(connection)) {
        this.retire(connection);
      }
      return;
    }

    if (message.id === null) {
      if ('error' in message) connection.rejected = true;
      return;
    }
    if ('result' in message) {
      // The server only sends results once `createContext` has succeeded, so
      // an earlier `id: null` error on this socket was not a rejection, e.g.
      // the server's reply to a malformed frame.
      connection.rejected = false;
    }

    const request = this.requestManager.get(message.id);
    if (
      request?.state.kind !== 'sent' ||
      request.state.connection !== connection
    ) {
      return;
    }

    if (
      'result' in message &&
      message.result.type === 'started' &&
      request.hideStarted
    ) {
      request.hideStarted = false;
      return;
    }

    let done = true;
    if (
      'result' in message &&
      request.message.method === 'subscription' &&
      message.result.type !== 'stopped'
    ) {
      done = false;
      if (message.result.type === 'data' && message.result.id !== undefined) {
        request.message.params.lastEventId = message.result.id;
      }
    }

    callUserCallback(() => request.callbacks.next(message));
    if (done) {
      this.requestManager.delete(request.message);
      callUserCallback(() => request.callbacks.complete());
      this.closeIfDrained(connection);
    }
  }

  /**
   * The server asked the current connection to reconnect. It drains while a
   * new one opens: nothing in flight on it fails or is sent again.
   */
  private retire(connection: Connection) {
    if (connection.phase === 'ready') {
      // Invisible to subscribers: the state stays `pending` while the old
      // connection serves its requests.
      connection.drain();
      this.draining.add(connection);
    } else {
      connection.close();
    }
    this.requestManager.unbatch(connection);
    this.scheduleReconnect(this.nextRetryIndex(connection));
    this.closeIfDrained(connection);
  }

  /**
   * Whether a replaced connection is still open, so the client isn't
   * disconnected even though its next connection isn't ready.
   */
  private hasDrainingConnection() {
    return this.draining.size > 0;
  }

  /**
   * Closes a replaced connection once nothing is in flight on it and its
   * replacement is ready, or the client is closing.
   */
  private closeIfDrained(connection: Connection) {
    if (connection.phase !== 'draining') return;
    if (this.lifecycle.kind !== 'open' && this.lifecycle.kind !== 'idle') {
      return;
    }
    if (this.requestManager.sentOn(connection).length > 0) return;
    this.draining.delete(connection);
    connection.close();
  }

  /**
   * Settles the requests of a connection that is gone. Queries and mutations
   * sent on it fail, since they may have run, and so do those waiting for its
   * next batch, as they always have. Subscriptions are queued to resume on
   * the next connection.
   */
  private onConnectionLost(connection: Connection, cause: unknown) {
    if (connection.phase === 'closed') return;
    connection.close();
    this.draining.delete(connection);

    for (const request of [
      ...this.requestManager.sentOn(connection),
      ...this.requestManager.queuedFor(connection),
    ]) {
      if (request.message.method === 'subscription') {
        this.requestManager.requeue(request, { hideStarted: false });
        continue;
      }
      this.requestManager.delete(request.message);
      callUserCallback(() =>
        request.callbacks.error(
          TRPCClientError.from(
            isObject(cause)
              ? cause
              : new TRPCWebSocketClosedError({
                  message: 'WebSocket closed',
                  cause,
                }),
          ),
        ),
      );
    }

    if (!this.isCurrent(connection)) {
      // A draining connection: its subscriptions go on the current one, if
      // it's ready, or wait for the next.
      const lifecycle = this.lifecycle.kind;
      if (lifecycle === 'backoff' || lifecycle === 'connecting') {
        if (!this.hasDrainingConnection()) {
          this.setConnecting(
            new TRPCWebSocketClosedError({
              message: 'WebSocket closed',
              cause,
            }),
          );
        }
      }
      this.scheduleFlush();
    }
  }

  /**
   * Reconnects after the current connection was lost or failed to open.
   */
  private afterConnectionLost(connection: Connection, cause: unknown) {
    if (!this.isCurrent(connection)) return;

    if (this.lifecycle.kind === 'connecting') {
      if (!this.hasDrainingConnection()) {
        this.setConnecting(
          new TRPCWebSocketClosedError({
            message: 'Initialization error',
            cause,
          }),
        );
      }
      this.scheduleReconnect(
        connection.retryIndex === null ? 0 : connection.retryIndex + 1,
      );
      return;
    }

    if (this.lazyMode && this.requestManager.isEmpty()) {
      this.lifecycle = { kind: 'idle' };
      this.inactivityTimeout.stop();
      this.setState({ type: 'state', state: 'idle', error: null });
      return;
    }

    this.setConnecting(
      new TRPCWebSocketClosedError({ message: 'WebSocket closed', cause }),
    );
    this.scheduleReconnect(this.nextRetryIndex(connection));
  }

  /**
   * A connection the server rejected carries on with the backoff; any other
   * starts over.
   */
  private nextRetryIndex(connection: Connection) {
    return connection.rejected ? (connection.retryIndex ?? 0) + 1 : 0;
  }

  /**
   * Sends the queued requests as one batch: on the next tick when a
   * connection is ready, so requests made together go together, or as soon
   * as the next connection is ready.
   */
  private scheduleFlush() {
    if (this.lifecycle.kind === 'idle') {
      if (this.requestManager.queued().length === 0) return;
      if (this.connectionState.get().state === 'idle') {
        this.setConnecting(null);
      }
      this.connect(null);
      return;
    }
    if (this.lifecycle.kind !== 'open') return;
    // A request made while the socket is closing waits for the next one.
    if (this.lifecycle.connection.isWritable()) {
      this.requestManager.batchFor(this.lifecycle.connection);
    }
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    });
  }

  private stopFlushTimer() {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
  }

  private flush() {
    this.stopFlushTimer();
    if (this.lifecycle.kind !== 'open') return;
    const connection = this.lifecycle.connection;
    if (this.requestManager.queued().length === 0) return;
    if (!connection.isWritable()) {
      // The socket is closing, e.g. the server sent a close frame, but its
      // `close` event can be held up by the closing handshake. Don't wait.
      this.onConnectionLost(connection, undefined);
      this.afterConnectionLost(connection, undefined);
      return;
    }

    const requests = this.requestManager.flush(connection);
    if (requests.length === 0) return;

    const messages = requests.map((request) => request.message);
    try {
      connection.send(
        this.encoder.encode(messages.length === 1 ? messages[0] : messages),
      );
    } catch (cause) {
      this.failBatch(requests, cause);
    }
  }

  private failBatch(requests: Request[], cause: unknown) {
    for (const request of requests) {
      this.requestManager.delete(request.message);
    }
    for (const request of requests) {
      callUserCallback(() =>
        request.callbacks.error(
          TRPCClientError.from(
            getCauseFromUnknown(cause) ?? new Error('Unknown error'),
          ),
        ),
      );
    }
  }
}
