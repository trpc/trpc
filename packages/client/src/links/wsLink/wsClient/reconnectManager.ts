import { sleep } from '@trpc/server/unstable-core-do-not-import';
import { TRPCWebSocketClosedError } from './utils';
import type { WsConnection } from './wsConnection';

/**
 * Manages WebSocket reconnections with configurable retry logic.
 * Handles the lifecycle of a WebSocket connection, including error handling and retries.
 */
export class ReconnectManager {
  private connection: WsConnection | null;

  constructor(
    connection: WsConnection,
    private readonly retryDelayMs: (attemptIndex: number) => number,
    private readonly callbacks: {
      onError: (error: TRPCWebSocketClosedError) => void;
    },
  ) {
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
            this.reconnect();
          });
          ws.addEventListener('error', (event) => {
            this.callbacks.onError(
              new TRPCWebSocketClosedError({
                message: 'WebSocket closed',
                cause: event,
              }),
            );
            this.reconnect();
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
    if (this.reconnecting) return;

    const tryReconnect = async (attemptIndex: number) => {
      try {
        await sleep(this.retryDelayMs(attemptIndex));
        if (this.connection) {
          await this.connection.close();
          await this.connection.open();
        }
        this.reconnecting = null;
      } catch {
        await tryReconnect(attemptIndex + 1);
      }
    };

    this.reconnecting = tryReconnect(0);
  }

  public stop() {
    this.connection = null;
  }
}
