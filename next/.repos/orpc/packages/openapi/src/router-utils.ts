import type { RouterContract } from '@orpc/contract'
import { ProcedureContract, resolveMetaPlugins } from '@orpc/contract'
import { isTypescriptObject, pathToHttpPath, toArray } from '@orpc/shared'
import { getOpenAPIMeta, openapi } from './meta'

export type PopulatedContractRouterOpenAPIPaths<T extends RouterContract>
  = T extends ProcedureContract<infer UInputSchema, infer UOutputSchema, infer UErrors>
    ? ProcedureContract<UInputSchema, UOutputSchema, UErrors>
    : {
        [K in keyof T]: T[K] extends RouterContract ? PopulatedContractRouterOpenAPIPaths<T[K]> : never
      }

export interface PopulateRouterContractOpenAPIPathsOptions {
  /**
   * Base path segments.
   */
  path?: undefined | string[]
}

/**
 * Automatically populates missing openapi.path using router structure.
 *
 * Builds paths by joining router keys with `/`.
 * Useful when you want to ensure all contracts define openapi.path, such as for NestJS integration requirements.
 *
 * @see {@link https://orpc.dev/docs/integrations/nest | Implement oRPC contract with NestJS}
 */
export function populateRouterContractOpenAPIPaths<T extends RouterContract>(
  router: T,
  options: PopulateRouterContractOpenAPIPathsOptions = {},
): PopulatedContractRouterOpenAPIPaths<T> {
  const path = toArray(options.path)

  if (router instanceof ProcedureContract) {
    if (getOpenAPIMeta(router)?.path !== undefined) {
      return router as any
    }

    const [meta, metaPlugins] = resolveMetaPlugins(
      router['~orpc'].meta,
      router['~orpc'].metaPlugins,
      [openapi({ path: pathToHttpPath(path) })],
    )

    return new ProcedureContract({
      ...router['~orpc'],
      meta,
      metaPlugins,
    }) as any
  }

  if (!isTypescriptObject(router)) {
    return router as any
  }

  const populated: Record<string, any> = {}

  for (const key of Object.keys(router)) {
    populated[key] = populateRouterContractOpenAPIPaths(
      router[key]!,
      { ...options, path: [...path, key] },
    )
  }

  return populated as any
}
