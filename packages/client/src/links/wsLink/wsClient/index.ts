import type {AnyTRPCRouter} from '@trpc/server';
import {BehaviorSubject, behaviorSubject} from '@trpc/server/observable';
import {
  run,
  sleep,
  TRPCClientIncomingMessage,
  TRPCClientIncomingRequest,
  TRPCClientOutgoingMessage,
  TRPCResponseMessage,
} from '@trpc/server/unstable-core-do-not-import';
import {TRPCClientError} from '../../../TRPCClientError';
import type {TRPCConnectionState} from '../../internals/subscriptions';
import type {Operation} from '../../types';
import {ReconnectManager, TRPCWebSocketReconnectFatal,} from './ReconnectManager';
import {RequestManager, TCallbacks} from './RequestManager';
import {buildConnectionMessage, prepareUrl, ResettableTimeout, TRPCWebSocketClosedError} from './utils';
import {backwardCompatibility, WsConnection} from './wsConnection';
import type {WebSocketClientOptions} from './options';
import {exponentialBackoff, keepAliveDefaults, lazyDefaults} from './options';

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
  private readonly reconnectManager: ReconnectManager;
  private readonly callbacks: Pick<WebSocketClientOptions, 'onOpen' | 'onClose' | 'onError'>;
  private readonly connectionParams: WebSocketClientOptions['connectionParams'];
  private readonly lazyEnabled: boolean;

  constructor(opts: WebSocketClientOptions) {
    if (!opts.WebSocket) {
      throw new Error(
          "No WebSocket implementation found - you probably don't want to use this on the server, but if you do you need to pass a `WebSocket`-ponyfill",
      );
    }

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
    }
    this.lazyEnabled = lazyOptions.enabled;

    // Set up inactivity timeout for lazy connections.
    this.inactivityTimeout = new ResettableTimeout(() => {
      if (
        this.requestManager.hasPendingRequests() ||
        this.requestManager.hasActiveRequests()
      ) {
        this.inactivityTimeout.reset();
        return;
      }

      this.close();
    }, lazyOptions.closeMs);

    // Initialize the WebSocket connection.
    this.activeConnection = new WsConnection(
        {
          WebSocketPonyfill: opts.WebSocket,
          promiseUrl: prepareUrl(opts.url, !!opts.connectionParams).catch(error => {
            throw new TRPCWebSocketReconnectFatal({
              message:
                  'Error when building url. Ensure provided url(): Promise<string> does not throws.',
              cause: error,
            });
          }),
          keepAlive: {
            ...keepAliveDefaults,
            ...opts.keepAlive,
          }
        }
    );
    this.activeConnection.wsObservable.subscribe({
      next: (ws) => {
        if (!ws) return;
        this.setupWebSocketListeners(ws);
      },
    });

    // Initialize the reconnection manager.
    this.reconnectManager = new ReconnectManager(
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
    );
    if (!lazyOptions.enabled) {
      this.reconnectManager.attach(this.activeConnection);
    }

    // Automatically open the connection if lazy mode is disabled.
    if (!lazyOptions.enabled) {
      this.open();
    }

    this.connectionState = behaviorSubject<
        TRPCConnectionState<TRPCClientError<AnyTRPCRouter>>
    >({
      type: 'state',
      state: lazyOptions.enabled ? 'idle' : 'connecting',
      error: null,
    });
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
      if (error instanceof TRPCWebSocketReconnectFatal) throw error;

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

      await this.reconnectManager.reconnect();
    }
  }

  /**
   * Closes the WebSocket connection and stops managing requests.
   * Ensures all pending and active requests are properly finalized.
   */
  public async close() {
    this.inactivityTimeout.stop();
    this.reconnectManager.stop();

    const requestsToAwait: Promise<void>[] = [];
    for (const {
      state,
      message,
      end,
      callbacks,
    } of this.requestManager.getRequests()) {
      if (message.method === 'subscription') {
        callbacks.complete();
      } else if (state === 'pending') {
        callbacks.error(
            TRPCClientError.from(
                new TRPCWebSocketClosedError({
                  message: 'Closed before connection was established',
                }),
            ),
        );
      } else {
        requestsToAwait.push(end);
      }
    }

    await Promise.all(requestsToAwait);

    this.activeConnection.close();
    this.connectionState.next({
      type: 'state',
      state: 'idle',
      error: null,
    });
  }

  /**
   * Method to request the server.
   * Handles batching of requests and provides a mechanism to abort the request.
   *
   * @returns A function to abort the request.
   */
  public request(opts: {
    op: Operation;
    callbacks: TCallbacks;
    lastEventId: string | undefined;
  }) {
    const { op, callbacks, lastEventId } = opts;
    const { type, input, path, id } = op;

    const abort = this.batchSend(
        {
          id,
          method: type,
          params: {
            input,
            path,
            lastEventId,
          },
        },
        callbacks,
    );

    return () => {
      if (op.type === 'subscription' && this.activeConnection.isOpen()) {
        this.send({
          id,
          method: 'subscription.stop',
        });
      }

      abort();
    };
  }

  public get connection() {
    return backwardCompatibility(this.activeConnection);
  }

  private setupWebSocketListeners(ws: WebSocket) {
    ws.addEventListener('open', async () => {
      if (this.lazyEnabled) {
        this.inactivityTimeout.start();
      }

      if (this.connectionParams) {
        ws.send(await buildConnectionMessage(this.connectionParams));
      }

      this.callbacks.onOpen?.();

      this.connectionState.next({
        type: 'state',
        state: 'pending',
        error: null,
      });

      const messages = this.requestManager
        .getActiveRequests()
        .map(({ message }) => message);
      if (messages.length) {
        ws.send(JSON.stringify(messages.length === 1 ? messages[0] : messages));
      }
    });

    ws.addEventListener('message', ({ data }) => {
      if (typeof data !== 'string' || ['PING', 'PONG'].includes(data)) return;

      const incomingMessage = JSON.parse(data) as TRPCClientIncomingMessage;
      if ('method' in incomingMessage) {
        return this.handleIncomingRequest(incomingMessage);
      }

      return this.handleResponseMessage(incomingMessage);
    });

    const handleCloseOrError = (cause: unknown) => {
      const reqs = this.requestManager.getActiveRequests();
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

    ws.addEventListener('close', (event) => {
      handleCloseOrError(event);
      this.callbacks.onClose?.(event);
    });

    ws.addEventListener('error', (event) => {
      handleCloseOrError(event);
      this.callbacks.onError?.(event);
    });
  }

  private async handleResponseMessage(message: TRPCResponseMessage) {
    const request = this.requestManager.getActiveRequest(message.id);
    if (!request) return;

    request.callbacks?.next(message);

    let keepOpen = false;
    if ('result' in message && request.message.method === 'subscription') {
      if (message.result.type === 'data') {
        request.message.params.lastEventId = message.result.id;
      }

      if (message.result.type === 'stopped') {
        request.callbacks?.complete();
      } else {
        keepOpen = true;
      }
    }

    if (!keepOpen) {
      this.requestManager.delete(message.id);
    }
  }

  private async handleIncomingRequest(message: TRPCClientIncomingRequest) {
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

      await this.reconnectManager.reconnect();
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

    run(async () => {
      if (!this.activeConnection.isOpen()) {
        await this.open();
      }
      await sleep(0);
      if (!this.requestManager.hasPendingRequests()) return;
      this.send(this.requestManager.flush().map(({ message }) => message));
    });

    return this.requestManager.register(message, callbacks);
  }
}
