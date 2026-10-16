import type { StandardLazyResponse, StandardRequest } from '@standard-server/core'
import type { ClientContext, ClientOptions } from '../../types'

/**
 * Handles the transport layer for sending requests and receiving responses.
 *
 * Implementations are responsible for the actual network communication,
 * such as HTTP fetch, WebSocket, or other transport mechanisms.
 */
export interface StandardLinkTransport<T extends ClientContext> {
  /**
   * @throws Transport-level errors (network failures, timeouts, etc.)
   */
  send(request: StandardRequest, path: string[], options: ClientOptions<T>): Promise<StandardLazyResponse>
}
