import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { t } from '../trpc'

export const userRouter = t.router({
  // READ
  byUserId: t.procedure
    .input(
      z.object({
        userId: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      console.log(
        `${new Date().toISOString()} | Querying user.. | Where: ${
          typeof window === 'undefined' ? 'Server' : 'Client'
        }`
      )
      const { userId } = input

      const user = { userId: '123', username: 'bennett' }

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `No user for user ID '${userId}'`,
        })
      } else {
        return user
      }
    }),
})
