import type { ClientContext, ClientLink, ORPCClientOptions } from '@orpc/client'
import type { RouterContract, RouterContractClient } from '@orpc/contract'
import type { JsonifiedClient } from './types'
import { createContractClientFactory } from '@orpc/contract'

export interface ContractJsonifiedClientFactory<
  TClientContext extends ClientContext,
> {
  <T extends RouterContract>(contract: T): JsonifiedClient<RouterContractClient<T, TClientContext>>
}

export interface ContractJsonifiedClientFactoryOptions<
  TClientContext extends ClientContext,
> extends Pick<ORPCClientOptions<JsonifiedClient<RouterContractClient<RouterContract, TClientContext>>>, 'interceptors' | 'scoped'> {
  /**
   * An optional reference to the root router-contract.
   * When provided, the client factory will automatically register the passed contract
   * into the router at the path defined by `meta.path`.
   */
  contractRef?: undefined | RouterContract
}

export function createContractJsonifiedClientFactory<
  TClientContext extends ClientContext,
>(
  link: ClientLink<TClientContext>,
  options: ContractJsonifiedClientFactoryOptions<TClientContext> = {},
): ContractJsonifiedClientFactory<TClientContext> {
  return createContractClientFactory(link, options) as ContractJsonifiedClientFactory<TClientContext>
}
