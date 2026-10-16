import { messagePublisher } from '@/context'
import { router } from '@/routers'
import { createRouterClient } from '@orpc/server'

globalThis.$client = createRouterClient(router, {
  context: { messagePublisher },
})
