import type { Arrayable, MaybeOptionalOptions } from '@orpc/shared'
import type { DecodePeerMessageOptions, EncodePeerMessageOptions } from '@standard-server/peer'
import type { Context } from '../../context'
import type { FriendlyStandardHandlerHandleOptions, StandardHandler } from '../standard'
import { loadBytes, resolveMaybeOptionalOptions, sequential, toStringOrBytes } from '@orpc/shared'
import { decodePeerMessage, encodePeerMessage, isClientPeerSendMessage, ServerPeer } from '@standard-server/peer'
import { createStandardPeerRequestHandler } from '../standard-peer'

/**
 * Supports standard WebSocket instances, Bun ServerWebSocket, "ws" ServerWebSocket,
 * Cloudflare WebSocket Hibernation, and similar implementations.
 */
export type WebSocketLike = {
  send: (data: string | Uint8Array<ArrayBuffer>) => unknown
}

export interface WebSocketHandlerOptions<_T extends Context> {
  /**
   * Options for encoding peer messages. such as `prefix` for distinguishing messages on the same channel..
   */
  encodePeerMessage?: EncodePeerMessageOptions | undefined

  /**
   * Options for decoding peer messages. such as `prefix` for distinguishing messages on the same channel..
   */
  decodePeerMessage?: DecodePeerMessageOptions | undefined
}

export class WebSocketHandler<T extends Context> {
  private readonly peers = new WeakMap<WebSocketLike, ServerPeer>()
  private readonly encodePeerMessageOptions: WebSocketHandlerOptions<T>['encodePeerMessage']
  private readonly decodePeerMessageOptions: WebSocketHandlerOptions<T>['decodePeerMessage']

  constructor(
    private readonly handler: StandardHandler<T>,
    options: NoInfer<WebSocketHandlerOptions<T>> = {},
  ) {
    this.encodePeerMessageOptions = options.encodePeerMessage
    this.decodePeerMessageOptions = options.decodePeerMessage
  }

  /**
   * Handles a single WebSocket message.
   *
   * Message order matters. Call this immediately after receiving a message,
   * before any other async work, to preserve ordering.
   *
   * To avoid async Blob reads, configure `ws.binaryType` to return binary data
   * directly (for example, `arraybuffer`).
   *
   * @param ws The WebSocket instance. Use the same instance for all messages.
   * @param data The received message. Binary data should already be loaded (not a `Blob`).
   */
  async message(
    ws: WebSocketLike,
    data: Arrayable<string | ArrayBuffer | Pick<Uint8Array<ArrayBuffer>, 'buffer' | 'byteOffset' | 'byteLength'>>,
    ...rest: MaybeOptionalOptions<FriendlyStandardHandlerHandleOptions<T>>
  ): Promise<{ matched: boolean }> {
    let peer = this.peers.get(ws)

    if (!peer) {
      this.peers.set(ws, peer = new ServerPeer(async (message) => {
        const encoded = await encodePeerMessage(message, this.encodePeerMessageOptions)
        await ws.send(encoded)
      }))
    }

    /**
     * Message order is important: loading -> decode -> .message.
     * This flow must stay synchronous, or we need to use `sequential` helper
     */
    const encoded = toStringOrBytes(data)
    const result = decodePeerMessage(encoded, this.decodePeerMessageOptions)
    if (result.matched && isClientPeerSendMessage(result.message)) {
      await peer.message(
        result.message,
        createStandardPeerRequestHandler(this.handler, resolveMaybeOptionalOptions(rest)),
      )
    }

    return result
  }

  /**
   * Cleans up peer state for a closed WebSocket.
   *
   * @param ws The same WebSocket instance passed to `.message()`.
   */
  async close(ws: WebSocketLike): Promise<void> {
    const peer = this.peers.get(ws)

    if (peer) {
      // delete before close to avoid potential race conditions
      this.peers.delete(ws)
      await peer.close()
    }
  }

  /**
   * Attaches message, close, and error event listeners to a WebSocket.
   *
   * Prefer this over calling `.message()` and `.close()` manually.
   */
  upgrade(
    ws: Pick<WebSocket, 'send' | 'addEventListener' | 'removeEventListener'>,
    ...rest: MaybeOptionalOptions<FriendlyStandardHandlerHandleOptions<T>>
  ): void {
    /**
     * Message order is important: loading -> decode -> .message.
     * This flow must stay synchronous, or we need to use `sequential` helper
     */
    ws.addEventListener('message', sequential(async (event) => {
      // For better compatibility avoid control or depend on websocket.binaryType
      const data = event.data instanceof Blob ? await loadBytes(event.data) : event.data

      // Not awaited: `this.message` runs business logic that may be slow,
      // and awaiting it would block decoding of subsequent messages.
      this.message(ws, data, ...rest)
    }))
    ws.addEventListener('close', () => this.close(ws))

    // EventEmitter-based implementations like `ws` throw an unhandled `error` event,
    // so a single malformed frame would crash the process. `close` always follows and handles cleanup.
    ws.addEventListener('error', () => {})
  }
}
