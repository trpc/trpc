import './instrumentation'

import { serve } from 'bun'
import index from './frontend/index.html'
import { RPCHandler } from '@orpc/server/websocket'
import { messagePublisher } from './context'
import { router } from './routers'
import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { OpenAPIReferenceHandlerPlugin } from '@orpc/openapi/plugins'
import { CORSHandlerPlugin } from '@orpc/server/plugins'
import { EvlogHandlerPlugin } from '@orpc/evlog'
import { OpenAPIGenerator } from '@orpc/openapi'
import { ZodToJsonSchemaConverter } from '@orpc/zod'
import { SmartCoercionHandlerPlugin } from '@orpc/json-schema'

const zodConverter = new ZodToJsonSchemaConverter()

const openapiGenerator = new OpenAPIGenerator({
  converters: [zodConverter],
})

const openapiHandler = new OpenAPIHandler(router, {
  plugins: [
    new CORSHandlerPlugin({
      exposeHeaders: ['Content-Disposition', 'Standard-Server'],
    }),
    new EvlogHandlerPlugin({ logAbort: true }),
    new SmartCoercionHandlerPlugin({ converters: [zodConverter] }),
    new OpenAPIReferenceHandlerPlugin({
      spec: () => openapiGenerator.generate(router, {
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

const rpcHandler = new RPCHandler(router, {
  plugins: [
    new EvlogHandlerPlugin({ logAbort: true }),
  ],
})

async function handleOpenAPIRequest(request: Request) {
  const { response } = await openapiHandler.handle(request, {
    prefix: '/api',
    context: { messagePublisher },
  })

  return response ?? new Response('Not found', { status: 404 })
}

const server = serve({
  routes: {
    '/*': index,

    '/api': handleOpenAPIRequest,
    '/api/*': handleOpenAPIRequest,

    '/ws/rpc': (req, server) => {
      if (server.upgrade(req)) {
        return new Response('Update successful')
      }

      return new Response('Upgrade failed', { status: 500 })
    },
  },

  websocket: {
    message(ws, message) {
      rpcHandler.message(ws, message, {
        /**
         * Provide initial context if needed. The context can be an async function
         * that receives the per-call request as its first argument, and is **not**
         * related to the initial WebSocket upgrade request.
         */
        context: request => ({
          messagePublisher,
        }),
      })
    },
    close(ws) {
      rpcHandler.close(ws)
    },
  },

  development: process.env.NODE_ENV !== 'production' && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
})

console.log(`🚀 Server running at ${server.url}`)
