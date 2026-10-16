import { createFileRoute } from '@tanstack/react-router'
import { createMiddleware } from '@tanstack/react-start'

const handleInvalidParams = createMiddleware().server(async ({ next }) => {
  try {
    return await next()
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid child id') {
      return new Response(error.message, { status: 400 })
    }
    throw error
  }
})

export const Route = createFileRoute('/api/parsed-params/$id/$childId')({
  params: {
    parse: (params) => {
      const childId = Number(params.childId)
      if (!Number.isFinite(childId)) {
        throw new Error('Invalid child id')
      }
      return { childId }
    },
    stringify: (params) => ({ childId: String(params.childId) }),
  },
  server: {
    handlers: ({ createHandlers }) =>
      createHandlers({
        GET: {
          middleware: [handleInvalidParams],
          handler: ({ params, request, next }) => {
            if (new URL(request.url).searchParams.has('render')) {
              return next({ context: { handlerParams: params } })
            }
            const id: number = params.id
            const childId: number = params.childId
            return Response.json({ id, childId })
          },
        },
      }),
  },
  loader: ({ params, serverContext }) => ({
    loaderParams: params,
    handlerParams: serverContext?.handlerParams,
  }),
  component: () => (
    <pre data-testid="parsed-params">
      {JSON.stringify(Route.useLoaderData())}
    </pre>
  ),
})
