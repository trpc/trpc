import type { AnyTRPCRouter, inferRouterError } from '@trpc/server';
import type { Observer } from '@trpc/server/observable';
import type {
  TRPCClientOutgoingMessage,
  TRPCResponseMessage,
} from '@trpc/server/unstable-core-do-not-import';
import type { TRPCClientError } from '../../../TRPCClientError';
import type { RequestId } from './machine/requestMachine';
import { withResolvers } from './utils';

export type TCallbacks = Observer<
  TRPCResponseMessage<unknown, inferRouterError<AnyTRPCRouter>>,
  TRPCClientError<AnyTRPCRouter>
>;

/**
 * One call over the WebSocket: the message it is sent as, the observer it
 * reports to, and `end`, which settles once the observer has completed or
 * errored, even if the observer throws. Where the request is lives in the
 * request state machine.
 */
export interface Request {
  readonly message: TRPCClientOutgoingMessage;
  readonly callbacks: TCallbacks;
  readonly end: Promise<void>;
}

/**
 * Every live request's message and observer, by the id it is sent under.
 */
export class RequestManager {
  private readonly requests = new Map<
    TRPCClientOutgoingMessage['id'],
    Request
  >();

  public register(message: TRPCClientOutgoingMessage, callbacks: TCallbacks) {
    const { promise: end, resolve } = withResolvers<void>();
    this.requests.set(message.id, {
      message,
      end,
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
  }

  public get(id: RequestId) {
    return this.requests.get(id) ?? null;
  }

  public delete(id: RequestId) {
    this.requests.delete(id);
  }

  public all() {
    return [...this.requests.values()];
  }
}
