import type { SupportedMessagePort } from '@orpc/client/message-port'
import type { MaybeOptionalOptions, Promisable, Value } from '@orpc/shared'
import type { ClientPeerSendMessage, DecodePeerMessageOptions, EncodePeerMessageOptions } from '@standard-server/peer'
import type { Context } from '../../context'
import type { FriendlyStandardHandlerHandleOptions, StandardHandler } from '../standard'
import { onMessagePortClose, onMessagePortMessage, postMessagePortMessage } from '@orpc/client/message-port'
import { resolveMaybeOptionalOptions, value } from '@orpc/shared'
import { decodePeerMessage, encodePeerMessage, isClientPeerSendMessage, isPeerMessage, ServerPeer } from '@standard-server/peer'
import { createStandardPeerRequestHandler } from '../standard-peer'

type DecodedResponseMessage = ConstructorParameters<typeof ServerPeer>[0] extends (message: infer TMessage) => unknown
  ? TMessage
  : never

export interface MessagePortHandlerOptions<_T extends Context> {
  /**
   * By default, oRPC encodes peer messages as strings or binary data before sending them over the message port.
   * Use this option to bypass encoding and leverage the full capabilities of the
   * [MessagePort: postMessage() method](https://developer.mozilla.org/en-US/docs/Web/API/MessagePort/postMessage),
   * such as transferring object ownership or supporting non-serializable objects like `OffscreenCanvas` or improving performance.
   *
   * @remarks
   * **Note**: Returning `null` or `undefined` disables this feature.
   * **Warning**: Ensure your message port implementation supports `transferable` objects before enabling this.
   */
  experimental_transfer?: Value<Promisable<object[] | null | undefined>, [message: DecodedResponseMessage, port: SupportedMessagePort]>

  /**
   * Options for encoding peer messages. such as `prefix` for distinguishing messages on the same channel..
   */
  encodePeerMessage?: EncodePeerMessageOptions | undefined

  /**
   * Options for decoding peer messages. such as `prefix` for distinguishing messages on the same channel..
   */
  decodePeerMessage?: DecodePeerMessageOptions | undefined
}

export class MessagePortHandler<T extends Context> {
  private readonly peers = new WeakMap<SupportedMessagePort, ServerPeer>()
  private readonly transfer: MessagePortHandlerOptions<T>['experimental_transfer']
  private readonly encodePeerMessageOptions: MessagePortHandlerOptions<T>['encodePeerMessage']
  private readonly decodePeerMessageOptions: MessagePortHandlerOptions<T>['decodePeerMessage']

  constructor(
    private readonly handler: StandardHandler<T>,
    options: NoInfer<MessagePortHandlerOptions<T>> = {},
  ) {
    this.transfer = options.experimental_transfer
    this.encodePeerMessageOptions = options.encodePeerMessage
    this.decodePeerMessageOptions = options.decodePeerMessage
  }

  /**
   * Attaches message and close listeners to a message port.
   *
   * Prefer this over calling `.message()` and `.close()` manually.
   */
  upgrade(
    port: SupportedMessagePort,
    ...rest: MaybeOptionalOptions<FriendlyStandardHandlerHandleOptions<T>>
  ): void {
    /**
     * Message order is important: loading -> decode -> .message.
     * This flow must stay synchronous, or we need to use `sequential` helper
     */
    onMessagePortMessage(port, message => this.message(port, message, ...rest))
    onMessagePortClose(port, () => this.close(port))
  }

  /**
   * Handles a single message received from a message port.
   *
   * @param port The message port instance. Use the same instance for all messages.
   */
  async message(
    port: SupportedMessagePort,
    data: unknown,
    ...rest: MaybeOptionalOptions<FriendlyStandardHandlerHandleOptions<T>>
  ): Promise<{ matched: boolean }> {
    let peer = this.peers.get(port)

    if (!peer) {
      this.peers.set(port, peer = new ServerPeer(async (message) => {
        const transfer = await value(this.transfer, message, port)

        if (transfer) {
          postMessagePortMessage(port, message, transfer)
        }
        else {
          postMessagePortMessage(port, await encodePeerMessage(message, this.encodePeerMessageOptions))
        }
      }))
    }

    let peerMessage: ClientPeerSendMessage | undefined

    if (typeof data === 'string' || data instanceof Uint8Array) {
      // MessagePort receives the exact payload sent, and `encodePeerMessage` only returns string or Uint8Array.
      const result = decodePeerMessage(data as string | Uint8Array<ArrayBuffer>, this.decodePeerMessageOptions)
      if (result.matched && isClientPeerSendMessage(result.message)) {
        peerMessage = result.message
      }
    }

    else if (isPeerMessage(data) && isClientPeerSendMessage(data)) {
      peerMessage = data
    }

    if (peerMessage === undefined) {
      return { matched: false }
    }

    /**
     * Message order is important: loading -> decode -> .message.
     * This flow must stay synchronous, or we need to use `sequential` helper
     */
    await peer.message(peerMessage, createStandardPeerRequestHandler(this.handler, resolveMaybeOptionalOptions(rest)))
    return { matched: true }
  }

  /**
   * Cleans up peer state for a closed message port.
   *
   * @param port The same message port instance passed to `.message()`.
   */
  async close(port: SupportedMessagePort): Promise<void> {
    const peer = this.peers.get(port)

    if (peer) {
      // delete before close to avoid potential race conditions
      this.peers.delete(port)
      await peer.close()
    }
  }
}
