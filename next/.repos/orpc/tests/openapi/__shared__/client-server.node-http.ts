import type { AddressInfo } from 'node:net'
import type { CreateOpenAPIClientServerTest } from './client-server'
import * as http from 'node:http'
import { createORPCClient } from '@orpc/client'
import { OpenAPILink } from '@orpc/openapi/fetch'
import { OpenAPIHandler } from '@orpc/openapi/node'
import { defaultSerializer } from './client-server'

export const createNodeHttpClientServerTest: CreateOpenAPIClientServerTest = (
  router,
  { context = {}, serializer = defaultSerializer } = {},
) => {
  const handler = new OpenAPIHandler(router, {
    serializer,
  })

  const server = http.createServer(async (req, res) => {
    await handler.handle(req, res, {
      context,
      prefix: '/api',
    })
  })

  server.listen(0)

  afterAll(() => {
    server.close()
  })

  const addressInfo = server.address() as AddressInfo

  const link = new OpenAPILink(router as any, {
    url: '/api',
    origin: `http://localhost:${addressInfo.port}`,
    serializer,
    fetch(url, init) {
      return fetch(url, init)
    },
  })

  return createORPCClient(link)
}
