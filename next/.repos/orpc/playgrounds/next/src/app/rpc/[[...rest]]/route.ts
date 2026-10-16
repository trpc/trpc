import { router } from '@/routers'
import { RPCHandler } from '@orpc/server/fetch'
import { EvlogHandlerPlugin } from '@orpc/evlog'
import { messagePublisher } from '@/context'
import { BatchHandlerPlugin } from '@orpc/server/plugins'

export const handler = new RPCHandler(router, {
  plugins: [
    new EvlogHandlerPlugin({ logAbort: true }),
    new BatchHandlerPlugin(),
  ],
})

async function handleRequest(request: Request) {
  const { response } = await handler.handle(request, {
    prefix: '/rpc',
    context: { messagePublisher },
  })

  return response ?? new Response('Not found', { status: 404 })
}

export const HEAD = handleRequest
export const GET = handleRequest
export const POST = handleRequest
export const PUT = handleRequest
export const PATCH = handleRequest
export const DELETE = handleRequest
