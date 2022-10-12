/**
 * This file contains the root router of your tRPC-backend
 */
import { t } from '../trpc'
import { userRouter } from './router-user'

/**
 * Application's root router.
 * @link https://trpc.io/docs/router
 */
export const appRouter = t.router({
  user: userRouter,
})

// export type definition of API
export type AppRouter = typeof appRouter
