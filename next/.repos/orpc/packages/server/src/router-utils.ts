import type { AnyProcedureContract, AugmentContractRouterOptions, ErrorMap, MergedErrorMap, RouterContract } from '@orpc/contract'
import type { Promisable } from '@orpc/shared'
import type { Context, MergedInitialContext } from './context'
import type { Lazyable } from './lazy'
import type { AnyMiddleware } from './middleware'
import type { AnyProcedure, ProcedureConfig } from './procedure'
import type { AnyRouter } from './router'
import { mergeErrorMap, ProcedureContract, resolveMetaPlugins } from '@orpc/contract'
import { getOwn, isTypescriptObject, omit } from '@orpc/shared'
import { Lazy, unlazy } from './lazy'
import { Procedure } from './procedure'
import { getHiddenRouterContract } from './router-hidden'

export type AugmentedRouter<
  T extends AnyRouter,
  TErrorMap extends ErrorMap,
> = T extends Procedure<
  infer $InitialContext,
  infer $CurrentContext,
  infer $InputSchema,
  infer $OutputSchema,
  infer $ErrorMap
>
  ? Procedure<
    $InitialContext,
    $CurrentContext,
    $InputSchema,
    $OutputSchema,
    MergedErrorMap<TErrorMap, $ErrorMap>
  >
  : {
      [K in keyof T]: T[K] extends Lazy<infer $ extends AnyRouter>
        ? Lazy<AugmentedRouter<$, TErrorMap>>
        : T[K] extends AnyRouter
          ? AugmentedRouter<T[K], TErrorMap>
          : never
    }

export type AugmentedRouterWithMiddlewares<
  T extends AnyRouter,
  TInitialContext extends Context,
  TInjectedContext extends Context,
  TErrorMap extends ErrorMap,
>
  = T extends Procedure<
    infer $InitialContext,
    infer $CurrentContext,
    infer $InputSchema,
    infer $OutputSchema,
    infer $ErrorMap
  >
    ? Procedure<
      MergedInitialContext<TInitialContext, TInjectedContext, $InitialContext>,
      $CurrentContext,
      $InputSchema,
      $OutputSchema,
      MergedErrorMap<TErrorMap, $ErrorMap>
    >
    : {
        [K in keyof T]: T[K] extends Lazy<infer $ extends AnyRouter>
          ? Lazy<AugmentedRouterWithMiddlewares<$, TInitialContext, TInjectedContext, TErrorMap>>
          : T[K] extends AnyRouter
            ? AugmentedRouterWithMiddlewares<T[K], TInitialContext, TInjectedContext, TErrorMap>
            : never
      }

export interface AugmentRouterOptions<TErrorMap extends ErrorMap> extends AugmentContractRouterOptions<TErrorMap>, ProcedureConfig {
  middlewares: AnyMiddleware[]
}

export function augmentRouter<
  T extends AnyRouter,
  TInitialContext extends Context,
  TCurrentContext extends Context,
  TErrorMap extends ErrorMap,
>(
  router: T,
  options: AugmentRouterOptions<TErrorMap>,
): AugmentedRouter<T, TErrorMap> | AugmentedRouterWithMiddlewares<T, TInitialContext, TCurrentContext, TErrorMap> {
  if (router instanceof Lazy) {
    const [meta, metaPlugins] = resolveMetaPlugins(
      options.meta,
      options.metaPlugins,
      router['~orpc'].metaPlugins,
    )

    const enhanced = new Lazy({
      meta,
      metaPlugins,
      async loader() {
        const { default: unlaziedRouter } = await unlazy(router)
        const enhanced = augmentRouter(unlaziedRouter, options)
        return unlazy(enhanced)
      },
    })

    return enhanced as any
  }

  if (router instanceof Procedure) {
    const [meta, metaPlugins] = resolveMetaPlugins(
      options.meta,
      options.metaPlugins,
      router['~orpc'].metaPlugins,
    )

    const enhanced = new Procedure({
      ...omit(options, ['middlewares', 'errorMap', 'meta', 'metaPlugins']),
      ...router['~orpc'],
      meta,
      metaPlugins,
      errorMap: mergeErrorMap(options.errorMap, router['~orpc'].errorMap),
      orderedMiddlewares: [
        ...options.middlewares.map(middleware => ({ middleware, inputSchemasLengthAtUse: 0, outputSchemasLengthAtUse: 0 })),
        ...router['~orpc'].orderedMiddlewares,
      ],
    })

    return enhanced as any
  }

  if (!isTypescriptObject(router)) {
    return router as any
  }

  const enhanced = {} as Record<string, any>

  for (const [key, child] of Object.entries(router as Record<string, AnyRouter>)) {
    enhanced[key] = augmentRouter(child, options)
  }

  return enhanced as any
}

export interface AugmentImplementedRouterOptions extends ProcedureConfig {
  middlewares: AnyMiddleware[]
}

export function augmentImplementedRouter<
  T extends AnyRouter,
  TInitialContext extends Context,
  TCurrentContext extends Context,
>(
  router: T,
  options: AugmentImplementedRouterOptions,
): AugmentedRouter<T, object> | AugmentedRouterWithMiddlewares<T, TInitialContext, TCurrentContext, object> {
  if (router instanceof Lazy) {
    const enhanced = new Lazy({
      ...router['~orpc'],
      async loader() {
        const { default: unlaziedRouter } = await unlazy(router)
        const enhanced = augmentImplementedRouter(unlaziedRouter, options)
        return unlazy(enhanced)
      },
    })

    return enhanced as any
  }

  if (router instanceof Procedure) {
    const enhanced = new Procedure({
      ...omit(options, ['middlewares']),
      ...router['~orpc'],
      orderedMiddlewares: [
        ...options.middlewares.map(middleware => ({ middleware, inputSchemasLengthAtUse: 0, outputSchemasLengthAtUse: 0 })),
        ...router['~orpc'].orderedMiddlewares,
      ],
    })

    return enhanced as any
  }

  if (!isTypescriptObject(router)) {
    return router as any
  }

  const enhanced = {} as Record<string, any>

  for (const [key, child] of Object.entries(router as Record<string, AnyRouter>)) {
    enhanced[key] = augmentImplementedRouter(child, options)
  }

  return enhanced as any
}

export function getRouter<T extends Lazyable<AnyRouter | undefined>>(
  router: T,
  path: readonly string[],
): T extends Lazy<any> ? Lazy<AnyRouter | undefined> : Lazyable<AnyRouter | undefined> {
  let current: Lazyable<AnyRouter | undefined> = router

  for (let i = 0; i < path.length; i++) {
    const segment = path[i]!

    if (!isTypescriptObject(current)) {
      return undefined as any
    }

    if (current instanceof Procedure) {
      return undefined as any
    }

    if (!(current instanceof Lazy)) {
      current = getOwn(current, segment)

      continue
    }

    const lazied = current
    const rest = path.slice(i)

    return new Lazy({
      ...lazied['~orpc'],
      async loader() {
        const unwrapped = await unlazy(lazied)

        const next = getRouter(unwrapped.default, rest)

        return await unlazy(next)
      },
    })
  }

  if (!isTypescriptObject(current)) {
    return undefined as any
  }

  return current as any
}

export interface WalkProcedureContractsLazyResult {
  router: Lazy<AnyRouter>
  path: string[]
}

export function walkProcedureContractsSync(
  router: RouterContract | AnyRouter,
  callback: (contract: AnyProcedureContract | AnyProcedure, path: string[]) => void,
  path: string[] = [],
): WalkProcedureContractsLazyResult[] {
  const lazyResults: WalkProcedureContractsLazyResult[] = []

  walkProcedureContractsSyncInternal(router, callback, path.slice(), lazyResults)

  return lazyResults
}

function walkProcedureContractsSyncInternal(
  router: RouterContract | AnyRouter,
  callback: (contract: AnyProcedureContract | AnyProcedure, path: string[]) => void,
  path: string[],
  lazyResults: WalkProcedureContractsLazyResult[],
): void {
  const hiddenContract = getHiddenRouterContract(router)
  if (hiddenContract !== undefined) {
    router = hiddenContract
  }

  if (router instanceof ProcedureContract) {
    callback(router, path.slice())
    return
  }

  if (!isTypescriptObject(router)) {
    return
  }

  for (const [key, value] of Object.entries(router)) {
    path.push(key)

    if (value instanceof Lazy) {
      lazyResults.push({ router: value, path: path.slice() })
    }
    else {
      walkProcedureContractsSyncInternal(value, callback, path, lazyResults)
    }

    path.pop()
  }
}

export async function walkProcedureContractsAsync(
  router: RouterContract | AnyRouter,
  callback: (contract: AnyProcedureContract | AnyProcedure, path: string[]) => Promisable<void>,
  path: string[] = [],
): Promise<void> {
  const hiddenContract = getHiddenRouterContract(router)
  if (hiddenContract !== undefined) {
    router = hiddenContract
  }

  if (router instanceof ProcedureContract) {
    await callback(router, path)
    return
  }

  if (!isTypescriptObject(router)) {
    return
  }

  for (const [key, value] of Object.entries(router)) {
    if (value instanceof Lazy) {
      const { default: router } = await unlazy(value)
      await walkProcedureContractsAsync(router, callback, [...path, key])
    }
    else {
      await walkProcedureContractsAsync(value, callback, [...path, key])
    }
  }
}

export type UnlaziedRouter<T extends AnyRouter>
  = T extends AnyProcedure
    ? T
    : {
        [K in keyof T]: T[K] extends Lazyable<infer U extends AnyRouter> ? UnlaziedRouter<U> : never
      }

/**
 * Fully resolves all lazy routers inside a router, returning a plain router.
 * Useful for making a router with lazy parts contract-compatible.
 *
 * @see {@link https://orpc.dev/docs/contract/router#router-to-contract | Router Contract - Router to Contract}
 */
export async function unlazyRouter<T extends AnyRouter>(router: T): Promise<UnlaziedRouter<T>> {
  if (router instanceof Procedure) {
    return router as any
  }

  if (!isTypescriptObject(router)) {
    return router as any
  }

  const unlazied = {} as Record<string, any>

  for (const key of Object.keys(router)) {
    const item: Lazyable<AnyRouter> = router[key]!

    const { default: unlaziedRouter } = await unlazy(item)

    unlazied[key] = await unlazyRouter(unlaziedRouter)
  }

  return unlazied as any
}
