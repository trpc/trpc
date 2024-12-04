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
 * for handling pending and active requests.
 *
 * - **Pending requests**: Requests that are queued and waiting to be sent.
 * - **Active requests**: Requests that have been sent but are awaiting a response.
 *   For subscriptions, multiple responses may be received until the subscription is closed.
 */
export class RequestManager {
  /**
   * Stores requests that are pending, meaning they are registered but not yet sent over the WebSocket.
   */
  private pendingRequests = new Array<Request & { id: MessageId }>();

  /**
   * Stores requests that are active, meaning they have been sent over the WebSocket
   * but are still awaiting responses. For subscriptions, this includes requests
   * that may receive multiple responses.
   */
  private activeRequest: Record<MessageId, Request> = {};

  /**
   * Registers a new request by adding it to the pending queue and setting up
   * callbacks for lifecycle events such as completion or error.
   *
   * @param message - The outgoing message to be sent.
   * @param callbacks - Callback functions to observe the request's state.
   * @returns A cleanup function to manually remove the request.
   */
  public register(message: TRPCClientOutgoingMessage, callbacks: TCallbacks) {
    const { promise: end, resolve } = withResolvers<void>();

    this.pendingRequests.push({
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
   * Deletes a request from both the pending and active collections, if it exists.
   */
  public delete(messageId: MessageIdLike) {
    if (messageId === null) return;

    this.pendingRequests = this.pendingRequests.filter(
      ({ id }) => id !== String(messageId),
    );
    delete this.activeRequest[String(messageId)];
  }

  /**
   * Moves all pending requests to the active state and clears the pending queue.
   *
   * The caller is expected to handle the actual activation of the requests
   * (e.g., sending them over the network) after this method is called.
   *
   * @returns The list of requests that were transitioned to the active state.
   */
  public flush() {
    const requests = this.pendingRequests;
    this.pendingRequests = [];
    this.activeRequest = requests.reduce(
      (acc, { id, message, end, callbacks }) => ({
        ...acc,
        [id]: {
          message,
          end,
          callbacks,
        },
      }),
      {} as typeof this.activeRequest,
    );
    return requests;
  }

  /**
   * Retrieves all currently active requests, which are awaiting responses or
   * handling ongoing subscriptions.
   */
  public getActiveRequests() {
    return Object.values(this.activeRequest);
  }

  /**
   * Retrieves a specific active request by its message ID.
   */
  public getActiveRequest(messageId: MessageIdLike) {
    if (messageId === null) return null;

    return this.activeRequest[String(messageId)];
  }

  /**
   * Retrieves all pending requests, which are waiting to be sent.
   */
  public getPendingRequests() {
    return this.pendingRequests;
  }

  /**
   * Retrieves all requests, both pending and active, with their respective states.
   *
   * @returns An array of all requests with their state ("pending" or "active").
   */
  public getRequests() {
    return [
      ...this.getPendingRequests().map((request) => ({
        state: 'pending' as const,
        message: request.message,
        end: request.end,
        callbacks: request.callbacks,
      })),
      ...this.getActiveRequests().map((request) => ({
        state: 'active' as const,
        message: request.message,
        end: request.end,
        callbacks: request.callbacks,
      })),
    ];
  }

  /**
   * Checks if there are any active requests, including ongoing subscriptions.
   */
  public hasActiveRequests() {
    return this.getActiveRequests().length > 0;
  }

  /**
   * Checks if there are any pending requests waiting to be sent.
   */
  public hasPendingRequests() {
    return this.pendingRequests.length > 0;
  }
}
