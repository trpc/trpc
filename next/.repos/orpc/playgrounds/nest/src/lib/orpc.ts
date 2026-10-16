import type { RouterContractClient } from '@orpc/contract'
import { createORPCClient } from '@orpc/client'
import { JsonifiedClient } from '@orpc/openapi'
import { OpenAPILink } from '@orpc/openapi/fetch'
import { createTanstackQueryUtils } from '@orpc/tanstack-query'
import { contract } from '../contracts'

const link = new OpenAPILink(contract, {
  origin: 'http://localhost:3000',
})

export const client: JsonifiedClient<RouterContractClient<typeof contract>> = createORPCClient(link)

export const orpc = createTanstackQueryUtils(client)
