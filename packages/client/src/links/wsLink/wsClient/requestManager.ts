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
      callbacks: {
        next: callbacks.next,
        complete: () => {
          callbacks.complete();
          resolve();
        },
        error: (e) => {
          callbacks.error(e);
          resolve();
        },
      },
    });

    return () => {
      this.delete(message.id);
      callbacks.complete();
      resolve();
    };
  }

  /**
   * Deletes a request from both the outgoing and pending collections, if it exists.
   */
  public delete(messageId: MessageIdLike) {
    if (messageId === null) return;

    this.outgoingRequests = this.outgoingRequests.filter(
      ({ id }) => id !== String(messageId),
    );
    delete this.pendingRequests[String(messageId)];
  }

  /**
   * Moves all outgoing requests to the pending state and clears the outgoing queue.
   *
   * The caller is expected to handle the actual sending of the requests
   * (e.g., sending them over the network) after this method is called.
   *
   * @returns The list of requests that were transitioned to the pending state.
   */
  public flush() {
    const requests = this.outgoingRequests;
    this.outgoingRequests = [];

    for (const request of requests) {
      this.pendingRequests[request.id] = request;
    }
    return requests;
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
