import type { AnyTRPCRouter, inferRouterError } from '@trpc/server';
import type { Observer } from '@trpc/server/observable';
import type {
  TRPCClientOutgoingMessage,
  TRPCResponseMessage,
} from '@trpc/server/unstable-core-do-not-import';
import type { TRPCClientError } from '../../../TRPCClientError';
import { withResolvers } from './utils';
import type { Connection } from './wsConnection';

export type TCallbacks = Observer<
  TRPCResponseMessage<unknown, inferRouterError<AnyTRPCRouter>>,
  TRPCClientError<AnyTRPCRouter>
>;

type RequestId = TRPCClientOutgoingMessage['id'];

/**
 * Where a request is. A request only hears frames from the connection it was
 * sent on, so frames a replaced connection still delivers never reach it.
 */
export type RequestState =
  /**
   * Waiting to be sent: in the next batch on `connection`, which was open
   * when the request was made or opened while it waited, or on the next
   * ready connection when `connection` is `null`.
   */
  | { kind: 'queued'; connection: Connection | null }
  /** Sent on `connection`. */
  | { kind: 'sent'; connection: Connection };

/**
 * One call over the WebSocket: the message on the wire, the observer it
 * reports to, and `end`, which settles once the observer has completed or
 * errored, even if the observer throws.
 */
export interface Request {
  readonly message: TRPCClientOutgoingMessage;
  readonly callbacks: TCallbacks;
  readonly end: Promise<void>;
  state: RequestState;
  /**
   * Set when a subscription moves to a new connection without being lost, so
   * the move is invisible: the server's second `started` is dropped.
   */
  hideStarted: boolean;
}

/**
 * Every live request, queued or sent, by the id it is sent under. Ids are
 * unique per client, so a request is found by id alone, and its `state` says
 * which connection may answer it.
 */
export class RequestManager {
  private readonly requests = new Map<RequestId, Request>();

  /**
   * Queues a request.
   *
   * @returns A function that removes it and completes its observer.
   */
  public register(message: TRPCClientOutgoingMessage, callbacks: TCallbacks) {
    const { promise: end, resolve } = withResolvers<void>();

    this.requests.set(message.id, {
      message,
      end,
      state: { kind: 'queued', connection: null },
      hideStarted: false,
      callbacks: {
        next: callbacks.next,
        complete: () => {
          try {
            callbacks.complete();
          } finally {
            resolve();
          }
        },
        error: (e) => {
          try {
            callbacks.error(e);
          } finally {
            resolve();
          }
        },
      },
    });

    return () => {
      this.delete(message);
      try {
        callbacks.complete();
      } finally {
        resolve();
      }
    };
  }

  /**
   * Removes a request. A no-op for a request that is already gone.
   */
  public delete(message: TRPCClientOutgoingMessage) {
    if (this.requests.get(message.id)?.message === message) {
      this.requests.delete(message.id);
    }
  }

  public get(id: RequestId | null) {
    if (id === null) return null;
    return this.requests.get(id) ?? null;
  }

  /**
   * Puts every queued request that isn't waiting for a batch in the next
   * batch on `connection`.
   */
  public batchFor(connection: Connection) {
    for (const request of this.queued()) {
      if (request.state.connection === null) {
        request.state = { kind: 'queued', connection };
      }
    }
  }

  /**
   * Moves the requests waiting for a batch on `connection` to the next ready
   * connection.
   */
  public unbatch(connection: Connection) {
    for (const request of this.queuedFor(connection)) {
      request.state = { kind: 'queued', connection: null };
    }
  }

  /**
   * Marks every queued request as sent on `connection`.
   *
   * @returns Those requests, in the order they were registered. The caller
   * sends them.
   */
  public flush(connection: Connection) {
    const requests = this.queued();
    for (const request of requests) {
      request.state = { kind: 'sent', connection };
    }
    return requests;
  }

  /**
   * Puts a sent request back in the queue, to be sent on the next ready
   * connection.
   */
  public requeue(request: Request, opts: { hideStarted: boolean }) {
    request.state = { kind: 'queued', connection: null };
    request.hideStarted = opts.hideStarted;
  }

  public all() {
    return [...this.requests.values()];
  }

  public queued() {
    return this.all().filter((request) => request.state.kind === 'queued');
  }

  public queuedFor(connection: Connection) {
    return this.queued().filter(
      (request) =>
        request.state.kind === 'queued' &&
        request.state.connection === connection,
    );
  }

  public sentOn(connection: Connection) {
    return this.all().filter(
      (request) =>
        request.state.kind === 'sent' &&
        request.state.connection === connection,
    );
  }

  public isEmpty() {
    return this.requests.size === 0;
  }

  public hasSubscriptions() {
    return this.all().some(
      (request) => request.message.method === 'subscription',
    );
  }
}
