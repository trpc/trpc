import { publicProcedure, router } from '@monotest/trpc'

export const router01 = router({
  foo: publicProcedure.query(() => 'bar' as const),
})
