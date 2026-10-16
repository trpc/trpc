import { createFileRoute } from '@tanstack/react-router'
import { RawStream, createServerFn } from '@tanstack/react-start'
import { staticFunctionMiddleware } from '@tanstack/start-static-server-functions'

const fetchRawStream = createServerFn({ method: 'GET' })
  .middleware([staticFunctionMiddleware])
  .handler(async () => {
    return new RawStream(new Response('Static cache stream').body!, {
      hint: 'text',
    })
  })

export const Route = createFileRoute('/raw-stream')({
  loader: async () => {
    const result = await fetchRawStream()
    if (typeof document === 'undefined') {
      return ''
    }
    const stream = result as RawStream | ReadableStream<Uint8Array>
    return new Response(
      stream instanceof RawStream ? stream.stream : stream,
    ).text()
  },
  component: RawStreamComponent,
})

function RawStreamComponent() {
  return <p data-testid="raw-stream">{Route.useLoaderData()}</p>
}
