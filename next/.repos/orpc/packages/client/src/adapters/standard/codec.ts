import type { Promisable } from '@orpc/shared'
import type { StandardLazyResponse, StandardRequest } from '@standard-server/core'
import type { AnyORPCError } from '../../error'
import type { ClientContext, ClientOptions } from '../../types'

export type StandardLinkCodecDecodedResponse = { kind: 'output', output: unknown } | { kind: 'error', error: AnyORPCError }

export interface StandardLinkCodec<T extends ClientContext> {
  encodeInput(
    input: unknown,
    path: string[],
    options: ClientOptions<T>
  ): Promisable<StandardRequest>

  decodeResponse(
    response: StandardLazyResponse,
    path: string[],
    options: ClientOptions<T>
  ): Promisable<StandardLinkCodecDecodedResponse>
}
