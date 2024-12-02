import { sleep } from '@trpc/server/unstable-core-do-not-import';
import { TRPCWebSocketClosedError } from './utils';
import type { WsConnection } from './wsConnection';

/**
 * Represents a fatal WebSocket error that prevents reconnection attempts.
 * This error is used when retrying the connection would consistently fail due to
 * a non-recoverable issue.
 */
export class TRPCWebSocketReconnectFatal extends Error {
  constructor(opts: { message: string; cause?: unknown }) {
    super(opts.message, {
      cause: opts.cause,
    });
    this.name = 'TRPCWebSocketReconnectFatal';
    Object.setPrototypeOf(this, TRPCWebSocketReconnectFatal.prototype);
  }
}

/**
 * Manages WebSocket reconnections with configurable retry logic.
 * Handles the lifecycle of a WebSocket connection, including error handling and retries.
 */
export class ReconnectManager {
  private connection: WsConnection | undefined;

  constructor(
    private readonly retryDelayMs: (attemptIndex: number) => number,
    private readonly callbacks: {
      onError: (error: TRPCWebSocketClosedError) => void;
    },
  ) {}

  public attach(connection: NonNullable<typeof this.connection>) {
    this.connection = connection;
    this.connection.wsObservable.subscribe({
      next: (ws) => {
        if (!ws) return;

        ws.addEventListener('open', () => {
          ws.addEventListener('close', (event) => {
            this.callbacks.onError(
              new TRPCWebSocketClosedError({
                message: 'WebSocket closed',
                cause: event,
              }),
            );
            void this.reconnect();
          });
          ws.addEventListener('error', (event) => {
            this.callbacks.onError(
              new TRPCWebSocketClosedError({
                message: 'WebSocket closed',
                cause: event,
              }),
            );
            void this.reconnect();
          });
        });
      },
    });
  }

  /**
   * Manages the reconnection process for the WebSocket using retry logic.
   * Ensures that only one reconnection attempt is active at a time by tracking the current
   * reconnection state in the `reconnecting` promise.
   */
  private reconnecting: Promise<void> | null = null;
  public reconnect() {
    if (this.reconnecting) return this.reconnecting;

    const tryReconnect = async (attemptIndex = 0) => {
      await sleep(this.retryDelayMs(attemptIndex));
      if (!this.connection) return;

      try {
        await this.connection.close();
        await this.connection.open();
        this.reconnecting = null;
      } catch (error) {
        if (error instanceof TRPCWebSocketReconnectFatal) throw error;

        await tryReconnect(attemptIndex + 1);
      }
    };

    return (this.reconnecting = tryReconnect());
  }

  public stop() {
    this.connection = undefined;
  }
}
