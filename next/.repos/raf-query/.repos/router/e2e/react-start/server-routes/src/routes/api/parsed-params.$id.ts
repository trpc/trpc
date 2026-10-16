import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/parsed-params/$id')({
  params: {
    parse: (params) => ({ id: Number(params.id) }),
    stringify: (params) => ({ id: String(params.id) }),
  },
  server: {
    handlers: {
      GET: ({ params }) => {
        const id: number = params.id
        return Response.json({ id })
      },
    },
  },
})
