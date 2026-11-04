import type { AnyTRPCRouter, inferRouterError } from '@trpc/server';
import type { Observer } from '@trpc/server/observable';
import type {
  TRPCClientOutgoingMessage,
  TRPCResponseMessage,
} from '@trpc/server/unstable-core-do-not-import';
import type { TRPCClientError } from '../../../TRPCClientError';
import { withResolvers } from './utils';

export type TCallbacks = Observer<
  TRPCResponseMessage<unknown, inferRouterError<AnyTRPCRouter>>,
  TRPCClientError<AnyTRPCRouter>
>;

type MessageId = string;
type MessageIdLike = string | number | null;

/**
 * Represents a WebSocket request managed by the RequestManager.
 * Combines the network message, a utility promise (`end`) that mirrors the lifecycle
 * handled by `callbacks`, and a set of state monitoring callbacks.
 */
interface Request {
  message: TRPCClientOutgoingMessage;
  end: Promise<void>;
  callbacks: TCallbacks;
  /**
   * The socket the request was sent on, or `null` if it's not on one: it's
   * outgoing, or a reconnect is moving it to the next socket.
   */
  ws: WebSocket | null;
}

/**
 * Manages WebSocket requests, tracking their lifecycle and providing utility methods
 * for handling outgoing and pending requests.
 *
 * - **Outgoing requests**: Requests that are queued and waiting to be sent.
 * - **Pending requests**: Requests that have been sent and are in flight awaiting a response.
 *   For subscriptions, multiple responses may be received until the subscription is closed.
 */
export class RequestManager {
  /**
   * Stores requests that are outgoing, meaning they are registered but not yet sent over the WebSocket.
   */
  private outgoingRequests = new Array<Request & { id: MessageId }>();

  /**
   * Stores requests that are pending (in flight), meaning they have been sent over the WebSocket
   * and are awaiting responses. For subscriptions, this includes requests
   * that may receive multiple responses.
   */
  private pendingRequests: Record<MessageId, Request> = {};

  /**
   * Registers a new request by adding it to the outgoing queue and setting up
   * callbacks for lifecycle events such as completion or error.
   *
   * @param message - The outgoing message to be sent.
   * @param callbacks - Callback functions to observe the request's state.
   * @returns A cleanup function to manually remove the request.
   */
  public register(message: TRPCClientOutgoingMessage, callbacks: TCallbacks) {
    const { promise: end, resolve } = withResolvers<void>();

    this.outgoingRequests.push({
      id: String(message.id),
      message,
      end,
      ws: null,
      callbacks: {
        next: callbacks.next,
        complete: () => {
          callbacks.complete();
          resolve();
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
      callbacks.complete();
      resolve();
    };
  }

  /**
   * Deletes a request from both the outgoing and pending collections, if it exists.
   *
   * Matches the message itself rather than its id: a retry reuses the id, and
   * registers its request before the failed request with that id is deleted.
   */
  public delete(message: TRPCClientOutgoingMessage) {
    this.outgoingRequests = this.outgoingRequests.filter(
      (request) => request.message !== message,
    );
    const id = String(message.id);
    if (this.pendingRequests[id]?.message === message) {
      delete this.pendingRequests[id];
    }
  }

  /**
   * Moves all outgoing requests to the pending state and clears the outgoing queue.
   *
   * The caller is expected to handle the actual sending of the requests
   * (e.g., sending them over the network) after this method is called.
   *
   * @param ws - The socket the requests are sent on.
   * @returns The list of requests that were transitioned to the pending state.
   */
  public flush(ws: WebSocket | null = null) {
    const requests = this.outgoingRequests;
    this.outgoingRequests = [];

    for (const request of requests) {
      request.ws = ws;
      this.pendingRequests[request.id] = request;
    }
    return requests;
  }

  /**
   * Moves pending requests back to the outgoing queue, to be sent again.
   */
  public requeue(messages: TRPCClientOutgoingMessage[]) {
    for (const message of messages) {
      const id = String(message.id);
      const request = this.pendingRequests[id];
      if (request?.message !== message) continue;
      delete this.pendingRequests[id];
      this.outgoingRequests.push({ ...request, id, ws: null });
    }
  }

  /**
   * Marks the pending requests sent on `ws` as not on any socket, until
   * `assignAll()` gives them the socket they're sent on next.
   */
  public unassign(ws: WebSocket) {
    for (const request of this.getPendingRequests()) {
      if (request.ws === ws) request.ws = null;
    }
  }

  /**
   * Marks every pending request as sent on `ws`.
   */
  public assignAll(ws: WebSocket | null) {
    for (const request of this.getPendingRequests()) {
      request.ws = ws;
    }
  }

  /**
   * Retrieves all currently pending requests, which are in flight awaiting responses
   * or handling ongoing subscriptions.
   */
  public getPendingRequests() {
    return Object.values(this.pendingRequests);
  }

  /**
   * Retrieves a specific pending request by its message ID.
   */
  public getPendingRequest(messageId: MessageIdLike) {
    if (messageId === null) return null;

    return this.pendingRequests[String(messageId)];
  }

  /**
   * Retrieves all outgoing requests, which are waiting to be sent.
   */
  public getOutgoingRequests() {
    return this.outgoingRequests;
  }

  /**
   * Retrieves all requests, both outgoing and pending, with their respective states.
   *
   * @returns An array of all requests with their state ("outgoing" or "pending").
   */
  public getRequests() {
    return [
      ...this.getOutgoingRequests().map((request) => ({
        state: 'outgoing' as const,
        message: request.message,
        end: request.end,
        callbacks: request.callbacks,
      })),
      ...this.getPendingRequests().map((request) => ({
        state: 'pending' as const,
        message: request.message,
        end: request.end,
        callbacks: request.callbacks,
      })),
    ];
  }

  /**
   * Checks if there are any pending requests, including ongoing subscriptions.
   */
  public hasPendingRequests() {
    return this.getPendingRequests().length > 0;
  }

  /**
   * Checks if there are any pending subscriptions
   */
  public hasPendingSubscriptions() {
    return this.getPendingRequests().some(
      (request) => request.message.method === 'subscription',
    );
  }

  /**
   * Checks if there are any outgoing requests waiting to be sent.
   */
  public hasOutgoingRequests() {
    return this.outgoingRequests.length > 0;
  }
}
