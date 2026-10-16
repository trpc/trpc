import { MemoryPublisher } from '@orpc/publisher/memory'
import type { ServerContext } from './orpc'

export const messagePublisher: ServerContext['messagePublisher'] = new MemoryPublisher<Record<string, { message: string }>>({
  resume: {
    enabled: true,
  },
})
