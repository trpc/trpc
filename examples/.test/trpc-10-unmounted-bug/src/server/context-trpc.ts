import * as trpc from '@trpc/server'
import * as trpcNext from '@trpc/server/adapters/next'

/**
 * Creates context for each incoming request.
 * Will be available in all resolvers.
 *
 * @link https://trpc.io/docs/context
 */
export async function createContextTRPC(
  opts?: trpcNext.CreateNextContextOptions
) {
  /**
   * We could check the session here, but it would occur on every request,
   * and we don't need that.
   */

  // const userIdAuth: string | null = null
  // if (req) {
  // const result = await getUserByCookie(req)
  // const error = result.error

  // if (error) {
  //   throw new TRPCError({
  //     code: 'UNAUTHORIZED',
  //     message: `Error while authenticating user.`,
  //     cause: error,
  //   })
  // }

  // userIdAuth = result.user?.id ?? null
  // }

  const req = opts?.req
  const res = opts?.res

  return {
    req,
    res,
    // userIdAuth,
  }
}

export type ContextTRPC = trpc.inferAsyncReturnType<typeof createContextTRPC>
