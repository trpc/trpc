import type { AnyTRPCRouter } from '@trpc/server';
import type { BehaviorSubject, Observable } from '@trpc/server/observable';
import { behaviorSubject, observable } from '@trpc/server/observable';
import type {
  CombinedDataTransformer,
  MachineRuntime,
  TRPCClientOutgoingMessage,
} from '@trpc/server/unstable-core-do-not-import';
import {
  createMachineRuntime,
  createMachineTimers,
  createResourceMap,
  getCauseFromUnknown,
  isObject,
  iteratorResource,
  makeResource,
  transformResult,
} from '@trpc/server/unstable-core-do-not-import';
import { TRPCClientError } from '../../../TRPCClientError';
import type { TRPCConnectionState } from '../../internals/subscriptions';
import type { Operation, OperationResultEnvelope } from '../../types';
import { jsonEncoder } from './encoder';
import { clientTransition, initialClient } from './machine/clientMachine';
import type {
  ClientEffect,
  ClientEvent,
  ClientModel,
  PublicState,
  Timer,
} from './machine/clientModel';
import { drainingConnections, sendingConnection } from './machine/clientModel';
import type { ConnectionEvent } from './machine/connectionMachine';
import type {
  ConnectionId,
  RequestFailure,
  RequestId,
  WireId,
} from './machine/requestMachine';
import type { WebSocketClientOptions } from './options';
import { exponentialBackoff, keepAliveDefaults, lazyDefaults } from './options';
import { RequestManager } from './requestManager';
import { createScope, dispose } from './scope';
import type { Transport, TransportEvent } from './transport';
import { backwardCompatibility, openTransport } from './transport';
import {
  callUserCallback,
  rethrowAsync,
  TRPCWebSocketClosedError,
} from './utils';

type ConnectionState = TRPCConnectionState<TRPCClientError<AnyTRPCRouter>>;
type ClientRuntime = MachineRuntime<ClientModel, ClientEvent>;

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
 * client, one per connection and one per request. This function runs them
 * with `createMachineRuntime`, and says what each effect does. Sockets and
 * `connectionParams` are async iterables the runtime reads in one loop;
 * timers and the user's calls send their events at once. Sockets,
 * listeners, timers and requests are resources: each is disposed by
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

  const transports = createResourceMap<ConnectionId, Transport>();
  const timers = createMachineTimers<Timer>((timer) => {
    if (timer === 'flush') observeWritability();
    runtime.send({ type: 'timer', timer });
  });
  const requestManager = new RequestManager();
  const closeWaiters: (() => void)[] = [];
  /**
   * The last request's id. Each request gets its own instead of its
   * `op.id`, which a retry shares with the failed attempt. The model gives
   * each its id on the wire.
   */
  let lastRequestId = 0;

  const initial = initialClient({ lazy: lazy.enabled });
  const connectionState = behaviorSubject<ConnectionState>(
    toConnectionState(initial.state.publicState),
  );

  const runtime = createMachineRuntime({
    machine: { initial, transition: clientTransition },
    run: runEffect,
    onError: rethrowAsync,
  });
  runtime.use(transports);
  runtime.use(timers);
  // A socket the model no longer tracks has nothing left to report.
  runtime.subscribe((model) => {
    for (const id of [...transports.keys()]) {
      if (!model.connections.has(id)) transports.delete(id);
    }
  });

  /**
   * A socket that started closing, e.g. because the server sent a close
   * frame, says nothing until the closing handshake ends, so the client
   * looks before relying on it.
   */
  function observeWritability() {
    const connection = sendingConnection(runtime.state);
    if (connection === null) return;
    if (transports.get(connection)?.isWritable()) return;
    runtime.send({
      type: 'connection',
      connection,
      event: { type: 'socketUnwritable' },
    });
  }

  function runEffect(effect: ClientEffect, machine: ClientRuntime) {
    switch (effect.type) {
      case 'openSocket': {
        const transport = openTransport({
          id: effect.connection,
          WebSocketPonyfill,
          urlOptions: opts,
          keepAlive,
          encoder,
        });
        transports.set(effect.connection, transport);
        machine.intake(transportEvents(transport), machine.send);
        return;
      }
      case 'resolveParams': {
        const transport = transports.get(effect.connection);
        if (!transport) return;
        machine.intake(
          connectionEvents(effect.connection, transport.connectionParams()),
          machine.send,
        );
        return;
      }
      case 'sendParams':
        transports.get(effect.connection)?.send(effect.data);
        return;
      case 'closeSocket':
        transports.delete(effect.connection);
        return;
      case 'sendRequests':
        sendRequests(machine, effect.connection, effect.requests);
        return;
      case 'sendFence':
        transports.get(effect.connection)?.fence(effect.fence);
        return;
      case 'sendStop':
        transports
          .get(effect.connection)
          ?.send(
            encoder.encode({ id: effect.wire, method: 'subscription.stop' }),
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
        timers.start(effect.timer, effect.timer === 'flush' ? 0 : lazy.closeMs);
        return;
      case 'startBackoff': {
        let delayMs: number;
        try {
          delayMs = retryDelayMs(effect.retryIndex);
        } catch (error) {
          rethrowAsync(error);
          delayMs = exponentialBackoff(effect.retryIndex);
        }
        timers.start('backoff', delayMs);
        return;
      }
      case 'cancelTimer':
        timers.cancel(effect.timer);
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
    machine: ClientRuntime,
    connection: ConnectionId,
    requests: readonly {
      id: RequestId;
      wire: WireId;
      lastEventId: string | null;
    }[],
  ) {
    try {
      const messages: TRPCClientOutgoingMessage[] = [];
      for (const { id, wire, lastEventId } of requests) {
        const message = requestManager.get(id)?.message;
        if (!message) continue;
        messages.push(
          lastEventId !== null && 'params' in message
            ? {
                ...message,
                id: wire,
                params: { ...message.params, lastEventId },
              }
            : { ...message, id: wire },
        );
      }
      transports
        .get(connection)
        ?.send(encoder.encode(messages.length === 1 ? messages[0] : messages));
    } catch (cause) {
      machine.send({
        type: 'sendFailed',
        requests: requests.map((request) => request.id),
        cause,
      });
    }
  }

  const client: WsClient = {
    connectionState,

    close() {
      return new Promise<void>((resolve) => {
        closeWaiters.push(resolve);
        runtime.send({ type: 'close' });
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
        scope.defer(() => runtime.send({ type: 'unsubscribe', id }));

        observeWritability();
        runtime.send({
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
      const { lifecycle } = runtime.state;
      if (lifecycle.kind === 'open') {
        return backwardCompatibility(
          transports.get(lifecycle.connection) ?? null,
          true,
        );
      }
      const replaced = drainingConnections(runtime.state).at(-1);
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

  return client;
}

/** A socket's events as the client's, then `released` once it has none left. */
async function* transportEvents(
  transport: Transport,
): AsyncGenerator<ClientEvent, void> {
  const connection = transport.id;
  // Not `for await`, which keeps the last frame alive while it waits for the
  // next; see `createMachineRuntime`'s `intake`.
  await using iterator = iteratorResource(transport.events);
  let result: IteratorResult<TransportEvent> | null;
  while (true) {
    result = await iterator.next();
    if (result.done) break;
    yield toClientEvent(connection, result.value);
    result = null;
  }
  yield { type: 'connection', connection, event: { type: 'released' } };
}

function toClientEvent(
  connection: ConnectionId,
  event: TransportEvent,
): ClientEvent {
  if (event.type === 'frame') {
    return { type: 'frame', connection, message: event.message };
  }
  if (event.type === 'heartbeat') return { type: 'heartbeat', connection };
  if (event.type === 'fenced') {
    return { type: 'fenced', connection, fence: event.fence };
  }
  return { type: 'connection', connection, event };
}

async function* connectionEvents(
  connection: ConnectionId,
  events: AsyncIterable<ConnectionEvent>,
): AsyncGenerator<ClientEvent, void> {
  await using iterator = iteratorResource(events);
  let result: IteratorResult<ConnectionEvent> | null;
  while (true) {
    result = await iterator.next();
    if (result.done) break;
    yield { type: 'connection', connection, event: result.value };
    result = null;
  }
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
