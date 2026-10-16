import type { ClientContext, ClientLink, ORPCClientOptions } from '@orpc/client'
import type { RouterContract } from './router'
import type { RouterContractClient } from './router-client'
import { createORPCClient } from '@orpc/client'
import { get, isTypescriptObject, set } from '@orpc/shared'
import { resolveBasePathMeta } from './meta-built-in'
import { ProcedureContract } from './procedure'

export interface ContractClientFactory<
  TClientContext extends ClientContext,
> {
  <T extends RouterContract>(contract: T): RouterContractClient<T, TClientContext>
}

export interface ContractClientFactoryOptions<
  TClientContext extends ClientContext,
> extends Pick<ORPCClientOptions<RouterContractClient<RouterContract, TClientContext>>, 'interceptors' | 'scoped'> {
  /**
   * An optional reference to the root router-contract.
   * When provided, the client factory will automatically register the passed contract
   * into the router at the path defined by `meta.path`.
   */
  contractRef?: undefined | RouterContract
}

/**
 * Creates a client factory that builds a client from any procedure or router contract,
 * so large projects can import individual contracts instead of a single root client.
 *
 * @remarks
 * **Warning**: Every procedure contract passed to the factory must define `meta.path` matching its location in the root contract.
 *
 * @see {@link https://orpc.dev/docs/contract/client-factory | Contract Client Factory}
 */
export function createContractClientFactory<
  TClientContext extends ClientContext,
>(
  link: ClientLink<TClientContext>,
  options: ContractClientFactoryOptions<TClientContext> = {},
): ContractClientFactory<TClientContext> {
  const factory: ContractClientFactory<TClientContext> = (contract) => {
    const path = resolveBasePathMeta(contract)

    if (path === undefined) {
      throw new TypeError(
        'ContractClientFactory: procedure contract must define `meta.path` that matches its path in the root router contract.',
      )
    }

    const contractRef = options.contractRef
    if (contractRef) {
      const register = (contract: RouterContract, path: string[]) => {
        if (contract instanceof ProcedureContract) {
          set(contractRef, [...path, '~orpc'], contract['~orpc'])
          return
        }

        if (isTypescriptObject(contract)) {
          for (const [key, value] of Object.entries(contract)) {
            register(value, [...path, key])
          }
        }
      }

      register(contract, path)
    }

    return createORPCClient(link, { ...options as any, scoped: get(options.scoped, path), path })
  }

  return factory
}
