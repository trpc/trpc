import type { AnyProcedureContract } from '@orpc/contract'
import type { Value } from '@orpc/shared'
import type { StandardMethod } from '@standard-server/core'
import type { AnyProcedure } from '../../procedure'
import type { AnyRouter } from '../../router'
import type { WalkProcedureContractsLazyResult } from '../../router-utils'
import { normalizeHttpPath, pathToHttpPath, value } from '@orpc/shared'
import { unlazy } from '../../lazy'
import { Procedure } from '../../procedure'
import { createContractProcedure } from '../../procedure-utils'
import { getRouter, walkProcedureContractsSync } from '../../router-utils'

/**
 * Methods that can invoke procedures by default. Browsers cannot trigger them
 * cross-site without a CORS preflight or an HTML form, unlike `GET`, which a plain
 * `<a>` click or redirect can trigger with `SameSite=Lax` cookies attached. Other
 * methods (`HEAD`, `OPTIONS`, `QUERY`, ...) have safe semantics that should not
 * invoke a procedure that can modify data.
 *
 * @see {@link https://orpc.dev/docs/rpc/handler#supported-http-methods | RPC Handler - Supported HTTP Methods}
 */
export const RPC_DEFAULT_ALLOW_METHODS: readonly StandardMethod[] = ['POST', 'PUT', 'PATCH', 'DELETE']

export interface RPCMatcherOptions {
  /**
   * Filter which procedures are exposed for matching. Return `false` to exclude.
   *
   * @default true
   */
  filter?: Value<boolean, [procedure: AnyProcedureContract | AnyProcedure, path: string[]]>

  /**
   * Restricts which HTTP methods can invoke procedures, either with a list of allowed
   * methods or decided per request via a function. Requests using a disallowed method
   * are treated as unmatched. `GET` is excluded by default because it is exposed to
   * Cross-Site Request Forgery (CSRF) attacks.
   *
   * @default RPC_DEFAULT_ALLOW_METHODS (['POST', 'PUT', 'PATCH', 'DELETE'])
   * @see {@link https://orpc.dev/docs/rpc/handler#supported-http-methods | RPC Handler - Supported HTTP Methods}
   */
  allowMethods?: readonly StandardMethod[] | ((method: StandardMethod, procedure: AnyProcedure, path: string[]) => boolean)
}

// `%` or a char `encodeURIComponent` encodes, meaning normalization may change the pathname
const NORMALIZABLE_PATHNAME_REGEX = /[^\w\-.!~*'()/]/

interface TreeEntry {
  path: string[]
  contract: AnyProcedureContract
  procedure?: AnyProcedure | undefined
}

interface PendingLazyRouter extends WalkProcedureContractsLazyResult {
  /** in-flight load, shared so concurrent matches never load or re-index the same router twice */
  loading?: Promise<void> | undefined
}

export class RPCMatcher {
  private readonly filter: Exclude<RPCMatcherOptions['filter'], undefined>
  private readonly allowMethodsSet: undefined | ReadonlySet<StandardMethod>
  private readonly allowMethodsFn: undefined | ((method: StandardMethod, procedure: AnyProcedure, path: string[]) => boolean)
  private readonly rootRouter: AnyRouter

  private readonly tree: Map<`/${string}`, TreeEntry> = new Map()
  private readonly pendingLazyRouters: Map<string, PendingLazyRouter> = new Map()
  /** segment count of the deepest pending key, never lowered so it stays an upper bound */
  private maxPendingLazyRouterDepth = 0

  constructor(router: AnyRouter, options: RPCMatcherOptions = {}) {
    this.filter = options.filter ?? true

    const allowMethods = options.allowMethods ?? RPC_DEFAULT_ALLOW_METHODS
    if (typeof allowMethods !== 'function') {
      this.allowMethodsSet = new Set(allowMethods)
    }
    else {
      this.allowMethodsFn = allowMethods
    }

    this.rootRouter = router
    this.index(router)
  }

  private index(router: AnyRouter, path: string[] = []): void {
    const lazyResults = walkProcedureContractsSync(router, (procedure, procedurePath) => {
      if (!value(this.filter, procedure, procedurePath)) {
        return
      }

      this.tree.set(pathToHttpPath(procedurePath), {
        path: procedurePath,
        contract: procedure,
        // contract-first entries have no implementation yet, resolveProcedure fills it in on demand
        procedure: procedure instanceof Procedure ? procedure : undefined,
      })
    }, path)

    for (const result of lazyResults) {
      this.pendingLazyRouters.set(pathToHttpPath(result.path), result)
      this.maxPendingLazyRouterDepth = Math.max(this.maxPendingLazyRouterDepth, result.path.length)
    }
  }

  async match(method: StandardMethod, pathname: `/${string}`, prefix: `/${string}` | undefined): Promise<{ path: string[], procedure: AnyProcedure } | undefined> {
    if (this.allowMethodsSet && !this.allowMethodsSet.has(method)) {
      return undefined
    }

    if (prefix) {
      if (!pathname.startsWith(prefix)) {
        return undefined
      }

      const charAfterPrefix = pathname[prefix.length]

      if (charAfterPrefix === '/') {
        pathname = pathname.slice(prefix.length) as `/${string}`
      }
      else if (charAfterPrefix === undefined) {
        pathname = '/'
      }
      else if (prefix[prefix.length - 1] === '/') {
        pathname = pathname.slice(prefix.length - 1) as `/${string}`
      }
      else {
        return undefined
      }
    }

    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1) as `/${string}`
    }

    // most requests `await undefined` so conditionally await it to save a microtask turn
    const loading = this.resolvePendingLazyRouters(pathname)
    if (loading !== undefined) {
      await loading
    }

    let entry = this.tree.get(pathname)

    if (entry === undefined && NORMALIZABLE_PATHNAME_REGEX.test(pathname)) {
      // Retry with a normalized path: users may percent-encode characters that we store
      // unencoded ("a%62c" vs "abc"), or leave raw characters that we store encoded
      // ("a^b" vs "a%5Eb"), so normalization handles both without duplicate entries.

      const normalizedPathname = normalizeHttpPath(pathname)

      // most requests `await undefined` so conditionally await it to save a microtask turn
      const normalizedLoading = this.resolvePendingLazyRouters(normalizedPathname)
      if (normalizedLoading !== undefined) {
        await normalizedLoading
      }

      entry = this.tree.get(normalizedPathname)
    }

    if (entry === undefined) {
      return undefined
    }

    const procedure = entry.procedure ?? await this.resolveProcedure(entry)

    if (this.allowMethodsFn && !this.allowMethodsFn(method, procedure, entry.path)) {
      return undefined
    }

    return {
      path: entry.path,
      procedure,
    }
  }

  private resolvePendingLazyRouters(pathname: `/${string}`): Promise<void> | void {
    if (this.pendingLazyRouters.size === 0) {
      return
    }

    let slashIndex = 0

    // a pending key has as many segments as its path, so deeper prefixes can never match,
    // and scanning them would cost quadratic time on slash-heavy pathnames
    for (let depth = 1; slashIndex !== -1 && depth <= this.maxPendingLazyRouterDepth; depth++) {
      const nextSlashIndex = pathname.indexOf('/', slashIndex + 1)
      const httpPathPrefix = nextSlashIndex === -1 ? pathname : pathname.slice(0, nextSlashIndex)
      const pending = this.pendingLazyRouters.get(httpPathPrefix)

      if (pending !== undefined) {
        return this.loadPendingLazyRouter(httpPathPrefix, pending).then(() => this.resolvePendingLazyRouters(pathname))
      }

      slashIndex = nextSlashIndex
    }
  }

  private loadPendingLazyRouter(httpPathPrefix: string, pending: PendingLazyRouter): Promise<void> {
    if (pending.loading === undefined) {
      pending.loading = this.indexPendingLazyRouter(httpPathPrefix, pending).catch((error) => {
        pending.loading = undefined
        throw error
      })
    }

    return pending.loading
  }

  private async indexPendingLazyRouter(httpPathPrefix: string, pending: PendingLazyRouter): Promise<void> {
    const { default: router } = await unlazy(pending.router)

    this.index(router, pending.path)

    // removed only once indexed, so a concurrent match never observes this router as
    // neither pending nor indexed
    this.pendingLazyRouters.delete(httpPathPrefix)
  }

  private async resolveProcedure(entry: TreeEntry): Promise<AnyProcedure> {
    const { default: maybeProcedure } = await unlazy(getRouter(this.rootRouter, entry.path))

    if (!(maybeProcedure instanceof Procedure)) {
      throw new TypeError(
        `[Contract-First] Missing or invalid implementation for procedure at path: "${entry.path.join('.')}". `
        + `Ensure the procedure is correctly implemented and matches its contract.`,
      )
    }

    entry.procedure = createContractProcedure(maybeProcedure, entry.contract)

    return entry.procedure
  }
}
