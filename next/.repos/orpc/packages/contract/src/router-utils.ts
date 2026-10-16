import type { ErrorMap } from './error'
import type { MergedErrorMap } from './error-utils'
import type { AnyMetaPlugin, Meta } from './meta'
import type { AnyProcedureContract } from './procedure'
import type { RouterContract } from './router'
import { getOwn, isTypescriptObject } from '@orpc/shared'
import { mergeErrorMap } from './error-utils'
import { resolveMetaPlugins } from './meta-utils'
import { ProcedureContract } from './procedure'

export type AugmentedContractRouter<T extends RouterContract, TErrorMap extends ErrorMap>
  = T extends ProcedureContract<infer $InputSchema, infer $OutputSchema, infer $Errors>
    ? ProcedureContract<$InputSchema, $OutputSchema, MergedErrorMap<TErrorMap, $Errors>>
    : {
        [K in keyof T]: T[K] extends RouterContract ? AugmentedContractRouter<T[K], TErrorMap> : never
      }

export interface AugmentContractRouterOptions<TErrorMap extends ErrorMap> {
  meta: Meta
  metaPlugins?: AnyMetaPlugin[] | undefined
  errorMap: TErrorMap
}

/**
 * Add capabilities without changing identity of the router contract
 */
export function augmentContractRouter<T extends RouterContract, TErrorMap extends ErrorMap>(
  router: T,
  options: AugmentContractRouterOptions<TErrorMap>,
): AugmentedContractRouter<T, TErrorMap> {
  if (router instanceof ProcedureContract) {
    const [meta, metaPlugins] = resolveMetaPlugins(
      options.meta,
      options.metaPlugins,
      router['~orpc'].metaPlugins,
    )

    const enhanced = new ProcedureContract({
      ...router['~orpc'],
      errorMap: mergeErrorMap(options.errorMap, router['~orpc'].errorMap),
      meta,
      metaPlugins,
    })

    return enhanced as any
  }

  if (!isTypescriptObject(router)) {
    return router as any
  }

  const enhanced: Record<string, any> = {}

  for (const key of Object.keys(router)) {
    enhanced[key] = augmentContractRouter(router[key]!, options)
  }

  return enhanced as any
}

export function getRouterContract(router: RouterContract, path: readonly string[]): RouterContract | undefined {
  let current: RouterContract | undefined = router

  for (let i = 0; i < path.length; i++) {
    const segment = path[i]!

    if (!isTypescriptObject(current)) {
      return undefined
    }

    if (current instanceof ProcedureContract) {
      return undefined
    }

    current = getOwn(current, segment)
  }

  if (!isTypescriptObject(current)) {
    return undefined
  }

  return current
}

export function getProcedureContractOrThrow(router: RouterContract, path: readonly string[]): AnyProcedureContract {
  const procedure = getRouterContract(router, path)

  if (!(procedure instanceof ProcedureContract)) {
    throw new TypeError(`No valid procedure found at path "${path.join('.')}", this may happen when the router contract is not properly configured.`)
  }

  return procedure
}

/**
 * Minifies a router contract so it can be safely exported to the client
 * without exposing internal logic.
 *
 * @remarks
 * **Note**: Only the metadata needed by the client is preserved; all other data is stripped out.
 *
 * @see {@link https://orpc.dev/docs/contract/router | Router Contract}
 */
export function minifyRouterContract(router: RouterContract): RouterContract {
  if (router instanceof ProcedureContract) {
    const procedure: AnyProcedureContract = {
      '~orpc': {
        errorMap: {},
        meta: router['~orpc'].meta,
      },
    }

    return procedure
  }

  if (!isTypescriptObject(router)) {
    return router
  }

  const json: Record<string, RouterContract> = {}

  for (const [key, child] of Object.entries(router)) {
    json[key] = minifyRouterContract(child)
  }

  return json
}
