import type { ClientContext } from '../../types'
import type { RPCLinkCodecOptions, StandardLinkOptions } from '../standard'
import type { WebSocketLinkTransportOptions } from './transport'
import { RPCLinkCodec, StandardLink } from '../standard'
import { WebSocketLinkTransport } from './transport'

export interface RPCLinkOptions<T extends ClientContext>
  extends StandardLinkOptions<T>, WebSocketLinkTransportOptions<T>, RPCLinkCodecOptions<T> {
}

/**
 * Client link that communicates with an RPC Handler over a WebSocket connection.
 *
 * @see {@link https://orpc.dev/docs/adapters/websocket | WebSocket Adapters}
 */
export class RPCLink<T extends ClientContext> extends StandardLink<T> {
  constructor(options: RPCLinkOptions<T>) {
    const codec = new RPCLinkCodec(options)
    const transport = new WebSocketLinkTransport(options)
    super(codec, transport, options)
  }
}
