import { router01 } from '@monotest/router01'
import { router } from '@monotest/trpc'

export const appRouter = router({
  router01,
})

export type AppRouter = typeof appRouter
