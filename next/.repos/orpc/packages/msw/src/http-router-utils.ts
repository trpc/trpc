import type { RouterContract } from '@orpc/contract'
import type { Context } from '@orpc/server'
import type { HTTPProcedureUtilsOptions } from './http-procedure-utils'
import { ProcedureContract } from '@orpc/contract'
import { isTypescriptObject } from '@orpc/shared'
import { HTTPProcedureUtils } from './http-procedure-utils'

export type HTTPRouterUtils<T extends RouterContract, TContext extends Context>
  = T extends ProcedureContract<infer UInputSchema, infer UOutputSchema, infer UErrorMap>
    ? HTTPProcedureUtils<TContext, UInputSchema, UOutputSchema, UErrorMap>
    : {
        [K in keyof T]: T[K] extends RouterContract ? HTTPRouterUtils<T[K], TContext> : never
      }

export type HTTPRouterUtilsOptions<TContext extends Context> = HTTPProcedureUtilsOptions<TContext>

/**
 * Creates MSW HTTP utils from a router-contract (or an implemented router),
 * exposing typed MSW request handler builders for every procedure, served
 * through the fetch handler created by the `handler` option.
 *
 * @see {@link https://orpc.dev/docs/integrations/msw | MSW Integration}
 */
export function createHTTPUtils<T extends RouterContract, TContext extends Context = object>(
  contract: T,
  options: HTTPRouterUtilsOptions<TContext>,
): HTTPRouterUtils<T, TContext> {
  return createHTTPUtilsInternal(contract, options, []) as any
}

function createHTTPUtilsInternal(
  contract: RouterContract,
  options: HTTPRouterUtilsOptions<any>,
  path: readonly string[],
): unknown {
  if (contract instanceof ProcedureContract) {
    return new HTTPProcedureUtils(contract, path, options)
  }

  if (!isTypescriptObject(contract)) {
    return contract
  }

  const utils: Record<string, unknown> = {}

  for (const [key, child] of Object.entries(contract)) {
    utils[key] = createHTTPUtilsInternal(child, options, [...path, key])
  }

  return utils
}
