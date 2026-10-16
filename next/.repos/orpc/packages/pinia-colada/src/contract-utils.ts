import type { ClientContext } from '@orpc/client'
import type { ContractClientFactory, RouterContract, RouterContractClient } from '@orpc/contract'
import type { JsonifiedClient } from '@orpc/openapi'
import type { RouterUtils, RouterUtilsOptions } from './router-utils'
import { resolveBasePathMeta } from '@orpc/contract'
import { get } from '@orpc/shared'
import { createRouterUtils } from './router-utils'

export interface ContractUtilsFactory<TClientContext extends ClientContext> {
  <T extends RouterContract>(contract: T): RouterUtils<RouterContractClient<T, TClientContext>>
}

export interface ContractUtilsFactoryOptions<
  TClientContext extends ClientContext,
> extends Omit<RouterUtilsOptions<RouterContractClient<RouterContract, TClientContext>>, 'path'> {
}

/**
 * Creates a factory that builds Pinia Colada utils directly from a contract,
 * using the given contract client factory. Useful for scaling large projects
 * where each part only needs a slice of the router.
 *
 * @remarks
 * **Note**: The contract must define a `path` meta matching its position in the root router contract.
 *
 * @see {@link https://orpc.dev/docs/contract/client-factory#pinia-colada-integration | Contract Client Factory - Pinia Colada Integration}
 */
export function createContractUtilsFactory<
  TClientContext extends ClientContext,
>(
  clientFactory: ContractClientFactory<TClientContext>,
  options: ContractUtilsFactoryOptions<TClientContext>,
): ContractUtilsFactory<TClientContext> {
  const factory: ContractUtilsFactory<TClientContext> = (contract) => {
    const client = clientFactory(contract)
    const path = resolveBasePathMeta(contract)

    if (path === undefined) {
      throw new TypeError(
        'ContractUtilsFactory: procedure contract must define `meta.path` that matches its path in the root router contract.',
      )
    }

    return createRouterUtils(client, { ...options as any, path, scoped: get(options.scoped, path) })
  }

  return factory
}

export interface ContractJsonifiedUtilsFactory<TClientContext extends ClientContext> {
  <T extends RouterContract>(contract: T): RouterUtils<JsonifiedClient<RouterContractClient<T, TClientContext>>>
}

export interface ContractJsonifiedUtilsFactoryOptions<
  TClientContext extends ClientContext,
> extends Omit<RouterUtilsOptions<JsonifiedClient<RouterContractClient<RouterContract, TClientContext>>>, 'path'> {
}

export function createContractJsonifiedUtilsFactory<
  TClientContext extends ClientContext,
>(
  clientFactory: ContractClientFactory<TClientContext>,
  options: ContractJsonifiedUtilsFactoryOptions<TClientContext>,
): ContractJsonifiedUtilsFactory<TClientContext> {
  return createContractUtilsFactory(clientFactory, options) as ContractJsonifiedUtilsFactory<TClientContext>
}
