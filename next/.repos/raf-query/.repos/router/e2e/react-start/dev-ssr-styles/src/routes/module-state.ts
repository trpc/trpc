import { createFileRoute } from '@tanstack/react-router'

const instanceId = crypto.randomUUID()

export const Route = createFileRoute('/module-state')({
  server: {
    handlers: {
      GET: () => new Response(instanceId),
    },
  },
})
