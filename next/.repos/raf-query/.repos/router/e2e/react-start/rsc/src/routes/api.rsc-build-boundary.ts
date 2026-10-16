import { createFileRoute } from '@tanstack/react-router'
import { getRscBuildBoundarySentinel } from '~/utils/rscBuildBoundarySentinel'

export const Route = createFileRoute('/api/rsc-build-boundary')({
  server: {
    handlers: {
      GET: () => {
        return new Response(getRscBuildBoundarySentinel(), {
          headers: { 'Content-Type': 'text/plain' },
        })
      },
    },
  },
})
