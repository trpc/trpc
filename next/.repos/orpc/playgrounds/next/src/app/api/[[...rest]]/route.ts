import { router } from '@/routers'
import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { OpenAPIReferenceHandlerPlugin } from '@orpc/openapi/plugins'
import { CORSHandlerPlugin } from '@orpc/server/plugins'
import { EvlogHandlerPlugin } from '@orpc/evlog'
import { messagePublisher } from '@/context'
import { OpenAPIGenerator } from '@orpc/openapi'
import { ZodToJsonSchemaConverter } from '@orpc/zod'
import { SmartCoercionHandlerPlugin } from '@orpc/json-schema'

const zodConverter = new ZodToJsonSchemaConverter()

const generator = new OpenAPIGenerator({
  converters: [zodConverter],
})

const handler = new OpenAPIHandler(router, {
  plugins: [
    new CORSHandlerPlugin({
      exposeHeaders: ['Content-Disposition', 'Standard-Server'],
    }),
    new EvlogHandlerPlugin({ logAbort: true }),
    new SmartCoercionHandlerPlugin({ converters: [zodConverter] }),
    new OpenAPIReferenceHandlerPlugin({
      spec: () => generator.generate(router, {
        base: {
          servers: [{ url: '/api' }],
          components: {
            securitySchemes: {
              bearerAuth: {
                type: 'http',
                scheme: 'bearer',
              },
            },
          },
        },
      }),
      providerConfig: {
        authentication: {
          securitySchemes: {
            bearerAuth: {
              token: 'default-token',
            },
          },
        },
      },
    }),
  ],
})

async function handleRequest(request: Request) {
  const { response } = await handler.handle(request, {
    prefix: '/api',
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
