import type { AnyTRPCRouter } from '@trpc/server';
import type { BehaviorSubject, Observable } from '@trpc/server/observable';
import { behaviorSubject, observable } from '@trpc/server/observable';
import type {
  CombinedDataTransformer,
  TRPCClientOutgoingMessage,
} from '@trpc/server/unstable-core-do-not-import';
import {
  getCauseFromUnknown,
  isObject,
  makeResource,
  transformResult,
} from '@trpc/server/unstable-core-do-not-import';
import { TRPCClientError } from '../../../TRPCClientError';
import type { TRPCConnectionState } from '../../internals/subscriptions';
import type { Operation, OperationResultEnvelope } from '../../types';
import { jsonEncoder } from './encoder';
import type {
  ClientEffect,
  ClientEvent,
  ClientModel,
  PublicState,
  Timer,
} from './machine/clientMachine';
import { clientTransition, initialClient } from './machine/clientMachine';
import type {
  ConnectionId,
  RequestFailure,
  RequestId,
} from './machine/requestMachine';
import type { WebSocketClientOptions } from './options';
import { exponentialBackoff, keepAliveDefaults, lazyDefaults } from './options';
import { RequestManager } from './requestManager';
import { createScope, dispose, timeoutResource } from './scope';
import type { Transport } from './transport';
import { backwardCompatibility, openTransport } from './transport';
import {
  callUserCallback,
  rethrowAsync,
  TRPCWebSocketClosedError,
} from './utils';

type ConnectionState = TRPCConnectionState<TRPCClientError<AnyTRPCRouter>>;

/**
 * A WebSocket client for tRPC operations. Create one with `createWSClient`.
 */
export interface WsClient {
  /**
   * Observable tracking the current connection state, including errors.
   */
  readonly connectionState: BehaviorSubject<ConnectionState>;
  /**
   * Closes the WebSocket connection and stops managing requests.
   * Subscriptions complete, requests not sent yet fail, and the ones in
   * flight finish before the connection closes.
   */
  close(): Promise<void>;
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
  request(opts: {
    op: Pick<Operation, 'id' | 'type' | 'path' | 'input' | 'signal'>;
    transformer: CombinedDataTransformer;
    lastEventId?: string;
  }): Observable<
    OperationResultEnvelope<unknown, TRPCClientError<AnyTRPCRouter>>,
    TRPCClientError<AnyTRPCRouter>
  >;
  /**
   * The current WebSocket and its state, or `null` when there is no
   * socket. A socket the server asked to replace stays current until its
   * replacement is ready.
   */
  readonly connection: ReturnType<typeof backwardCompatibility>;
}

/**
 * A WebSocket client for tRPC operations, with lazy connections, reconnects,
 * keepAlive and request batching.
 *
 * Every decision is made by pure state machines in `./machine`: one for the
 * client, one per connection and one per request. This function is their
 * interpreter. It turns sockets, timers and calls into events, feeds them to
 * `clientTransition` one at a time, and runs the effects each step returns.
 * Sockets, listeners, timers and requests are resources: each is disposed by
 * whatever owns it.
 */
export function createWsClientRuntime(opts: WebSocketClientOptions): WsClient {
  const WebSocketPonyfill = opts.WebSocket ?? globalThis.WebSocket;
  if (!WebSocketPonyfill) {
    throw new Error(
      "No WebSocket implementation found - you probably don't want to use this on the server, but if you do you need to pass a `WebSocket`-ponyfill",
    );
  }
  const encoder = opts.experimental_encoder ?? jsonEncoder;
  const keepAlive = { ...keepAliveDefaults, ...opts.keepAlive };
  const retryDelayMs = opts.retryDelayMs ?? exponentialBackoff;
  const lazy = { ...lazyDefaults, ...opts.lazy };

  const transports = new Map<ConnectionId, Transport>();
  const timers = new Map<Timer, Disposable>();
  const requestManager = new RequestManager();
  const closeWaiters: (() => void)[] = [];
  const queue: ClientEvent[] = [];
  let dispatching = false;
  /**
   * The last id sent on the wire. Each request gets its own instead of its
   * `op.id`: a retry reuses the failed attempt's `op.id`, and the server's
   * late frames for that attempt must not reach the retry.
   */
  let lastRequestId = 0;

  const initial = initialClient({ lazy: lazy.enabled });
  let model: ClientModel = initial.state;
  const connectionState = behaviorSubject<ConnectionState>(
    toConnectionState(initial.state.publicState),
  );

  /**
   * Runs one event through the client state machine, then its effects. An
   * event raised while effects run, e.g. by a user callback, waits its turn.
   */
  function dispatch(event: ClientEvent) {
    queue.push(event);
    if (dispatching) return;
    dispatching = true;
    try {
      let next: ClientEvent | undefined;
      while ((next = queue.shift())) {
        const result = clientTransition(model, next);
        model = result.state;
        runEffects(result.effects);
        releaseForgottenTransports();
      }
    } finally {
      dispatching = false;
    }
  }

  /** A socket the model no longer tracks has nothing left to report. */
  function releaseForgottenTransports() {
    for (const [id, transport] of transports) {
      if (model.connections.has(id)) continue;
      transports.delete(id);
      dispose(transport);
    }
  }

  /**
   * A socket that started closing, e.g. because the server sent a close
   * frame, says nothing until the closing handshake ends, so the client
   * looks before relying on it.
   */
  function observeWritability() {
    const lifecycle = model.lifecycle;
    if (lifecycle.kind !== 'open') return;
    if (transports.get(lifecycle.connection)?.isWritable()) return;
    dispatch({
      type: 'connection',
      connection: lifecycle.connection,
      event: { type: 'socketUnwritable' },
    });
  }

  function runEffects(effects: readonly ClientEffect[]) {
    for (const effect of effects) {
      try {
        runEffect(effect);
      } catch (error) {
        rethrowAsync(error);
      }
    }
  }

  function runEffect(effect: ClientEffect) {
    switch (effect.type) {
      case 'openSocket': {
        const connection = effect.connection;
        transports.set(
          connection,
          openTransport({
            id: connection,
            WebSocketPonyfill,
            urlOptions: opts,
            keepAlive,
            encoder,
            onEvent: (event) => {
              if (event.type === 'frame') {
                dispatch({ type: 'frame', connection, message: event.message });
              } else if (event.type === 'heartbeat') {
                dispatch({ type: 'heartbeat', connection });
              } else {
                dispatch({ type: 'connection', connection, event });
              }
            },
          }),
        );
        return;
      }
      case 'resolveParams':
        transports.get(effect.connection)?.resolveParams();
        return;
      case 'sendParams':
        transports.get(effect.connection)?.send(effect.data);
        return;
      case 'closeSocket': {
        const transport = transports.get(effect.connection);
        if (transport) dispose(transport);
        return;
      }
      case 'sendRequests':
        sendRequests(effect.connection, effect.requests);
        return;
      case 'sendStop':
        transports
          .get(effect.connection)
          ?.send(
            encoder.encode({ id: effect.request, method: 'subscription.stop' }),
          );
        return;
      case 'next': {
        const request = requestManager.get(effect.request);
        if (request) {
          callUserCallback(() => request.callbacks.next(effect.message));
        }
        return;
      }
      case 'complete': {
        const request = requestManager.get(effect.request);
        requestManager.delete(effect.request);
        if (request) callUserCallback(() => request.callbacks.complete());
        return;
      }
      case 'fail': {
        const request = requestManager.get(effect.request);
        requestManager.delete(effect.request);
        if (request) {
          const error = toRequestError(effect.failure);
          callUserCallback(() => request.callbacks.error(error));
        }
        return;
      }
      case 'onOpen':
        callUserCallback(() => opts.onOpen?.());
        return;
      case 'onClose':
        callUserCallback(() => opts.onClose?.(effect.event));
        return;
      case 'onError':
        callUserCallback(() => opts.onError?.(effect.event));
        return;
      case 'startTimer':
        startTimer(effect.timer, effect.timer === 'flush' ? 0 : lazy.closeMs);
        return;
      case 'startBackoff': {
        let delayMs: number;
        try {
          delayMs = retryDelayMs(effect.retryIndex);
        } catch (error) {
          rethrowAsync(error);
          delayMs = exponentialBackoff(effect.retryIndex);
        }
        startTimer('backoff', delayMs);
        return;
      }
      case 'cancelTimer':
        stopTimer(effect.timer);
        return;
      case 'emitState': {
        const state = toConnectionState(effect.state);
        callUserCallback(() => connectionState.next(state));
        return;
      }
      case 'closed':
        for (const resolve of closeWaiters.splice(0)) resolve();
        return;
      case 'rethrow':
        rethrowAsync(effect.error);
        return;
      case 'invariantViolation':
        rethrowAsync(
          new Error(`wsClient invariant violated: ${effect.message}`),
        );
        return;
      default:
        effect satisfies never;
    }
  }

  function sendRequests(
    connection: ConnectionId,
    requests: readonly { id: RequestId; lastEventId: string | null }[],
  ) {
    try {
      const messages: TRPCClientOutgoingMessage[] = [];
      for (const { id, lastEventId } of requests) {
        const message = requestManager.get(id)?.message;
        if (!message) continue;
        messages.push(
          lastEventId !== null && 'params' in message
            ? { ...message, params: { ...message.params, lastEventId } }
            : message,
        );
      }
      transports
        .get(connection)
        ?.send(encoder.encode(messages.length === 1 ? messages[0] : messages));
    } catch (cause) {
      dispatch({
        type: 'sendFailed',
        requests: requests.map((request) => request.id),
        cause,
      });
    }
  }

  function startTimer(timer: Timer, ms: number) {
    stopTimer(timer);
    timers.set(
      timer,
      timeoutResource(() => {
        timers.delete(timer);
        if (timer === 'flush') observeWritability();
        dispatch({ type: 'timer', timer });
      }, ms),
    );
  }

  function stopTimer(timer: Timer) {
    const resource = timers.get(timer);
    if (!resource) return;
    timers.delete(timer);
    dispose(resource);
  }

  const client: WsClient = {
    connectionState,

    close() {
      return new Promise<void>((resolve) => {
        closeWaiters.push(resolve);
        dispatch({ type: 'close' });
      });
    },

    request({ op: { type, path, input, signal }, transformer, lastEventId }) {
      return observable<
        OperationResultEnvelope<unknown, TRPCClientError<AnyTRPCRouter>>,
        TRPCClientError<AnyTRPCRouter>
      >((observer) => {
        const id = ++lastRequestId;
        // The request's resources, released when the observer unsubscribes.
        const scope = createScope();
        requestManager.register(
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
              let transformed: ReturnType<typeof transformResult>;
              try {
                transformed = transformResult(event, transformer.output);
              } catch (cause) {
                observer.error(TRPCClientError.from(cause as Error));
                return;
              }
              if (!transformed.ok) {
                observer.error(TRPCClientError.from(transformed.error));
                return;
              }
              observer.next({ result: transformed.result });
            },
          },
        );
        scope.defer(() => dispatch({ type: 'unsubscribe', id }));

        observeWritability();
        dispatch({
          type: 'request',
          id,
          method: type,
          lastEventId: lastEventId ?? null,
        });

        if (signal?.aborted) {
          observer.complete();
        } else if (signal) {
          const onAbort = () => observer.complete();
          signal.addEventListener('abort', onAbort, { once: true });
          scope.use(
            makeResource({}, () =>
              signal.removeEventListener('abort', onAbort),
            ),
          );
        }

        return () => dispose(scope);
      });
    },

    get connection() {
      const { lifecycle, draining } = model;
      if (lifecycle.kind === 'open') {
        return backwardCompatibility(
          transports.get(lifecycle.connection) ?? null,
          true,
        );
      }
      const replaced = draining.at(-1);
      if (replaced !== undefined) {
        return backwardCompatibility(transports.get(replaced) ?? null, true);
      }
      return backwardCompatibility(
        lifecycle.kind === 'connecting'
          ? (transports.get(lifecycle.connection) ?? null)
          : null,
        false,
      );
    },
  };

  runEffects(initial.effects);
  return client;
}

function toConnectionState(state: PublicState): ConnectionState {
  switch (state.state) {
    case 'idle':
      return { type: 'state', state: 'idle', error: null };
    case 'pending':
      return { type: 'state', state: 'pending', error: null };
    case 'connecting':
      return {
        type: 'state',
        state: 'connecting',
        error:
          state.error &&
          TRPCClientError.from(
            new TRPCWebSocketClosedError({
              message: state.error.message,
              cause: state.error.cause,
            }),
          ),
      };
    default:
      return state satisfies never;
  }
}

function toRequestError(failure: RequestFailure) {
  switch (failure.kind) {
    case 'connectionLost':
      return TRPCClientError.from(
        isObject(failure.cause)
          ? failure.cause
          : new TRPCWebSocketClosedError({
              message: 'WebSocket closed',
              cause: failure.cause,
            }),
      );
    case 'closedBeforeSent':
      return TRPCClientError.from(
        new TRPCWebSocketClosedError({
          message: 'Closed before connection was established',
        }),
      );
    case 'sendFailed':
      return TRPCClientError.from(
        getCauseFromUnknown(failure.cause) ?? new Error('Unknown error'),
      );
    default:
      return failure satisfies never;
  }
}
