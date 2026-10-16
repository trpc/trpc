import type { SafeClient } from './client-safe'
import type { ORPCError } from './error'
import type { Client, ClientContext } from './types'

it('SafeClient', async () => {
  const client = {} as {
    ping: Client<ClientContext, string, number, Error | ORPCError<'BAD_GATEWAY', { val: string }>>
    nested: {
      pong: Client<ClientContext, { id: number }, { result: string }, Error>
    }
  }

  const safeClient = {} as SafeClient<typeof client>

  const pingResult = await safeClient.ping('test')
  expectTypeOf(pingResult.error).toEqualTypeOf<Error | ORPCError<'BAD_GATEWAY', { val: string }> | null>()
  expectTypeOf(pingResult.data).toEqualTypeOf<number | undefined>()
  expectTypeOf(pingResult.definedError).toEqualTypeOf<ORPCError<'BAD_GATEWAY', { val: string }> | null>()
  expectTypeOf(pingResult.isSuccess).toEqualTypeOf<boolean>()

  const pongResult = await safeClient.nested.pong({ id: 123 })
  expectTypeOf(pongResult.error).toEqualTypeOf<Error | null>()
  expectTypeOf(pongResult.data).toEqualTypeOf<{ result: string } | undefined>()
  expectTypeOf(pongResult.definedError).toEqualTypeOf<null>()
  expectTypeOf(pongResult.isSuccess).toEqualTypeOf<boolean>()
})
