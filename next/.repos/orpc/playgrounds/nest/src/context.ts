import { MemoryPublisher } from '@orpc/publisher/memory'

export const messagePublisher = new MemoryPublisher<Record<string, { message: string }>>({
  resume: {
    enabled: true,
  },
})
