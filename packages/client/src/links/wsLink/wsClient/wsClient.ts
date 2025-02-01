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
import type { WebSocketClientOptions } from './options';
import { exponentialBackoff, keepAliveDefaults, lazyDefaults } from './options';
import { ReconnectManager } from './reconnectManager';
import type { TCallbacks } from './requestManager';
import { RequestManager } from './requestManager';
import {
  buildConnectionMessage,
  ResettableTimeout,
  TRPCWebSocketClosedError,
} from './utils';
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

  private requestManager = new RequestManager();
  private readonly activeConnection: WsConnection;
  private inactivityTimeout: ResettableTimeout;
  private readonly callbacks: Pick<
    WebSocketClientOptions,
    'onOpen' | 'onClose' | 'onError'
  >;
  private readonly connectionParams: WebSocketClientOptions['connectionParams'];
  private readonly lazyMode:
    | { enabled: true }
    | { enabled: false; reconnectManager: ReconnectManager };

  constructor(opts: WebSocketClientOptions) {
    // Initialize callbacks, connection parameters, and options.
    this.callbacks = {
      onOpen: opts.onOpen,
      onClose: opts.onClose,
      onError: opts.onError,
    };
    this.connectionParams = opts.connectionParams;

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
    this.activeConnection = new WsConnection({
      WebSocketPonyfill: opts.WebSocket,
      urlOptions: opts,
      keepAlive: {
        ...keepAliveDefaults,
        ...opts.keepAlive,
      },
    });
    this.activeConnection.wsObservable.subscribe({
      next: (ws) => {
        if (!ws) return;
        this.setupWebSocketListeners(ws);
      },
    });

    this.lazyMode = lazyOptions.enabled
      ? {
          enabled: true,
        }
      : {
          enabled: false,
          reconnectManager: new ReconnectManager(
            this.activeConnection,
            opts.retryDelayMs ?? exponentialBackoff,
            {
              onError: (error) => {
                this.connectionState.next({
                  type: 'state',
                  state: 'connecting',
                  error: TRPCClientError.from(error),
                });
              },
            },
          ),
        };

    this.connectionState = behaviorSubject<
      TRPCConnectionState<TRPCClientError<AnyTRPCRouter>>
    >({
      type: 'state',
      state: lazyOptions.enabled ? 'idle' : 'connecting',
      error: null,
    });

    // Automatically open the connection if lazy mode is disabled.
    if (!lazyOptions.enabled) {
      this.open().catch(() => null);
    }
  }

  /**
   * Opens the WebSocket connection. Handles reconnection attempts and updates
   * the connection state accordingly.
   */
  private async open() {
    if (this.connectionState.get().state !== 'connecting') {
      this.connectionState.next({
        type: 'state',
        state: 'connecting',
        error: null,
      });
    }

    try {
      await this.activeConnection.open();
    } catch (error) {
      this.connectionState.next({
        type: 'state',
        state: 'connecting',
        error: TRPCClientError.from(
          new TRPCWebSocketClosedError({
            message: 'Initialization error',
            cause: error,
          }),
        ),
      });

      if (!this.lazyMode.enabled) {
        this.lazyMode.reconnectManager.reconnect();
      }
    }
  }

  /**
   * Closes the WebSocket connection and stops managing requests.
   * Ensures all outgoing and pending requests are properly finalized.
   */
  public async close() {
    this.inactivityTimeout.stop();
    if (!this.lazyMode.enabled) {
      this.lazyMode.reconnectManager.stop();
    }

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

    this.connectionState.next({
      type: 'state',
      state: 'idle',
      error: null,
    });
  }

  /**
   * Method to request the server.
   * Handles data transformation, batching of requests, and subscription lifecycle.
   *
   * @param op - The operation details including id, type, path, input and signal
   * @param transformer - Data transformer for serializing requests and deserializing responses
   * @param lastEventId - Optional ID of the last received event for subscriptions
   *
   * @returns An observable that emits operation results and handles cleanup
   */
  public request({
    op: { id, type, path, input, signal },
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

      return () => {
        abort();

        if (type === 'subscription' && this.activeConnection.isOpen()) {
          this.send({
            id,
            method: 'subscription.stop',
          });
        }

        signal?.removeEventListener('abort', abort);
      };
    });
  }

  public get connection() {
    return backwardCompatibility(this.activeConnection);
  }

  private setupWebSocketListeners(ws: WebSocket) {
    const handleCloseOrError = (cause: unknown) => {
      const reqs = this.requestManager.getPendingRequests();
      for (const { message, callbacks } of reqs) {
        if (message.method === 'subscription') continue;

        callbacks.error(
          TRPCClientError.from(
            cause ??
              new TRPCWebSocketClosedError({
                message: 'WebSocket closed',
                cause,
              }),
          ),
        );
        this.requestManager.delete(message.id);
      }
    };

    ws.addEventListener('open', async () => {
      if (this.lazyMode.enabled) {
        this.inactivityTimeout.start();
      }

      if (this.connectionParams) {
        try {
          ws.send(await buildConnectionMessage(this.connectionParams));
        } catch (error) {
          ws.close(3000);
          handleCloseOrError(error);
          return;
        }
      }

      this.callbacks.onOpen?.();

      this.connectionState.next({
        type: 'state',
        state: 'pending',
        error: null,
      });

      const messages = this.requestManager
        .getPendingRequests()
        .map(({ message }) => message);
      if (messages.length) {
        ws.send(JSON.stringify(messages.length === 1 ? messages[0] : messages));
      }
    });

    ws.addEventListener('message', ({ data }) => {
      this.inactivityTimeout.reset();

      if (typeof data !== 'string' || ['PING', 'PONG'].includes(data)) return;

      const incomingMessage = JSON.parse(data) as TRPCClientIncomingMessage;
      if ('method' in incomingMessage) {
        this.handleIncomingRequest(incomingMessage);
        return;
      }

      this.handleResponseMessage(incomingMessage);
    });

    ws.addEventListener('close', (event) => {
      handleCloseOrError(event);
      this.callbacks.onClose?.(event);
    });

    ws.addEventListener('error', (event) => {
      handleCloseOrError(event);
      this.callbacks.onError?.(event);
    });
  }

  private handleResponseMessage(message: TRPCResponseMessage) {
    const request = this.requestManager.getPendingRequest(message.id);
    if (!request) return;

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
      this.requestManager.delete(message.id);
    }
  }

  private handleIncomingRequest(message: TRPCClientIncomingRequest) {
    if (message.method === 'reconnect') {
      this.connectionState.next({
        type: 'state',
        state: 'connecting',
        error: TRPCClientError.from(
          new TRPCWebSocketClosedError({
            message: 'Server requested reconnect',
          }),
        ),
      });

      if (!this.lazyMode.enabled) {
        this.lazyMode.reconnectManager.reconnect();
      }
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
      JSON.stringify(messages.length === 1 ? messages[0] : messages),
    );
  }

  /**
   * Groups requests for batch sending.
   *
   * @returns A function to abort the batched request.
   */
  private batchSend(message: TRPCClientOutgoingMessage, callbacks: TCallbacks) {
    this.inactivityTimeout.reset();

    void run(async () => {
      if (!this.activeConnection.isOpen()) {
        await this.open();
      }
      await sleep(0);
      if (!this.requestManager.hasOutgoingRequests()) return;
      this.send(this.requestManager.flush().map(({ message }) => message));
    });

    return this.requestManager.register(message, callbacks);
  }
}
