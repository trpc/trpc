import type { RouterContract } from '@orpc/contract'
import type { Lazyable } from './lazy'
import type { AnyRouter } from './router'

const HIDDEN_ROUTER_CONTRACT_SYMBOL = Symbol.for('ORPC_HIDDEN_ROUTER_CONTRACT')

export function withHiddenRouterContract<T extends Lazyable<AnyRouter>>(router: T, contract: RouterContract): T {
  return new Proxy(router, {
    get(target, key) {
      if (key === HIDDEN_ROUTER_CONTRACT_SYMBOL) {
        return contract
      }

      return Reflect.get(target, key)
    },
  })
}

export function getHiddenRouterContract(router: Lazyable<AnyRouter | RouterContract>): RouterContract | undefined {
  return (router as any)[HIDDEN_ROUTER_CONTRACT_SYMBOL]
}
