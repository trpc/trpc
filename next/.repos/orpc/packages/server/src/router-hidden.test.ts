import { oc } from '@orpc/contract'
import { os } from './builder'
import { getHiddenRouterContract, withHiddenRouterContract } from './router-hidden'

const contract = {
  ping: oc.errors({ BAD_GATEWAY: {} }),
}

const router = {
  ping: os.handler(() => 'output'),
}

it('withHiddenRouterContract & getHiddenRouterContract', () => {
  const applied = withHiddenRouterContract(router, contract)

  expect(applied).not.toBe(router)
  expect(applied).toEqual(router)
  expect(getHiddenRouterContract(applied)).toEqual(contract)
})
