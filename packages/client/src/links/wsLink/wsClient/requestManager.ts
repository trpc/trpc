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
  /** Waiting for a ready connection. */
  | { kind: 'queued' }
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
      state: { kind: 'queued' },
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
  public requeue(request: Request) {
    request.state = { kind: 'queued' };
  }

  public all() {
    return [...this.requests.values()];
  }

  public queued() {
    return this.all().filter((request) => request.state.kind === 'queued');
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
