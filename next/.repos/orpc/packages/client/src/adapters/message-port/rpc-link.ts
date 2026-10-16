import type { ClientContext } from '../../types'
import type { RPCLinkCodecOptions, StandardLinkOptions } from '../standard'
import type { MessagePortLinkTransportOptions } from './transport'
import { RPCLinkCodec, StandardLink } from '../standard'
import { MessagePortLinkTransport } from './transport'

export interface RPCLinkOptions<T extends ClientContext>
  extends StandardLinkOptions<T>, MessagePortLinkTransportOptions<T>, RPCLinkCodecOptions<T> {
}

/**
 * Client link that communicates with an RPC Handler over a Message Port
 * (e.g. workers, iframes, browser extensions, Electron).
 *
 * @see {@link https://orpc.dev/docs/adapters/message-port | Message Port Adapter}
 */
export class RPCLink<T extends ClientContext> extends StandardLink<T> {
  constructor(options: RPCLinkOptions<T>) {
    const codec = new RPCLinkCodec(options)
    const transport = new MessagePortLinkTransport(options)
    super(codec, transport, options)
  }
}
