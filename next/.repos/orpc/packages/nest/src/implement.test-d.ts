import { oc } from '@orpc/contract'
import { implement, os } from '@orpc/server'
import { describe, it } from 'vitest'
import { z } from 'zod'
import { Implement } from './implement'

export const inputSchema = z.object({ input: z.number().transform(n => `${n}`) })

export const outputSchema = z.object({ output: z.number().transform(n => `${n}`) })

describe('@Implement', () => {
  it('require return an implemented procedure that satisfy default initial context', () => {
    const contract = oc.input(inputSchema).output(outputSchema)

    class _ImplProcedureController {
      @Implement(contract)
      ping() {
        return implement(contract).handler(() => ({}) as any)
      }

      @Implement(contract)
      ping_with_middleware_context() {
        return implement(contract).use(({ next }) => next({ context: { extra: 'value' } })).handler(() => ({}) as any)
      }

      // @ts-expect-error --- return invalid
      @Implement(contract)
      ping_invalid() {
        return 'invalid'
      }

      // @ts-expect-error --- initial context is not allowed
      @Implement(contract)
      ping_invalid_initial_context() {
        return implement(contract).$context<{ a: string }>().handler(() => ({}) as any)
      }

      // @ts-expect-error --- implement wrong contract
      @Implement(contract)
      ping_wrong_implement() {
        return implement(oc.input(inputSchema)).handler(() => ({}) as any)
      }
    }
  })

  it('require return an implemented router that satisfy default initial context', () => {
    const contract = {
      ping: oc.input(inputSchema).output(outputSchema),
    }

    class _ImplProcedureController {
      @Implement(contract)
      ping() {
        return {
          ping: implement(contract.ping).handler(() => ({}) as any),
        }
      }

      @Implement(contract)
      ping_with_middleware_context() {
        return {
          ping: implement(contract.ping).use(({ next }) => next({ context: { extra: 'value' } })).handler(() => ({}) as any),
        }
      }

      @Implement(contract)
      ping_with_lazy() {
        return {
          ping: os.lazy(() => Promise.resolve({ default: implement(contract.ping).handler(() => ({}) as any) })),
        }
      }

      // @ts-expect-error --- return invalid
      @Implement(contract)
      ping_invalid() {
        return 'invalid'
      }

      // @ts-expect-error --- initial context is not allowed
      @Implement(contract)
      ping_invalid_initial_context() {
        return {
          ping: implement(contract.ping).$context<{ a: string }>().handler(() => ({}) as any),
        }
      }

      // @ts-expect-error --- initial context is not allowed
      @Implement(contract)
      ping_invalid_initial_context_lazy() {
        return {
          ping: os.lazy(() => Promise.resolve({ default: implement(contract.ping).$context<{ a: string }>().handler(() => ({}) as any) })),
        }
      }

      // @ts-expect-error --- implement wrong contract
      @Implement(contract)
      ping_wrong_implement() {
        return {
          ping: implement(oc.input(inputSchema)).handler(() => ({}) as any),
        }
      }

      // @ts-expect-error --- implement wrong contract
      @Implement(contract)
      ping_wrong_implement_lazy() {
        return {
          ping: os.lazy(() => Promise.resolve({ default: implement(oc.input(inputSchema)).handler(() => ({}) as any) })),
        }
      }
    }
  })
})
