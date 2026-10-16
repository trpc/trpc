import type { ErrorMap } from './error'
import type { Meta, MetaPlugin } from './meta'
import type { RouterContract } from './router'
import type { AnySchema } from './schema'
import { isTypescriptObject } from '@orpc/shared'
import { ProcedureContract } from './procedure'

export interface PathMetaPlugin<
  TInputSchema extends AnySchema,
  TOutputSchema extends AnySchema,
  TErrorMap extends ErrorMap,
> extends MetaPlugin<TInputSchema, TOutputSchema, TErrorMap> {
  name: '~path'
}

/**
 * Built-in metadata plugins.
 * `meta.path` records a procedure contract's path inside the root contract,
 * which is required for the contract client factory pattern.
 *
 * @see {@link https://orpc.dev/docs/contract/client-factory | Contract Client Factory}
 */
export const meta = {
  path<
    TInputSchema extends AnySchema,
    TOutputSchema extends AnySchema,
    TErrorMap extends ErrorMap,
  >(
    path: string[],
  ): PathMetaPlugin<TInputSchema, TOutputSchema, TErrorMap> {
    return {
      name: '~path',
      init(meta) {
        return {
          ...meta,
          '~path': path,
        }
      },
    }
  },
}

export function getPathMeta(procedureOrLazy: { '~orpc': { meta: Meta } }): string[] | undefined {
  return procedureOrLazy['~orpc'].meta['~path'] as string[] | undefined
}

/**
 * Resolve the base path of a contract from the first procedure-contract
 * that defines `meta.path`: its `meta.path` minus its path inside the given contract.
 * For a procedure-contract, this is its `meta.path` itself.
 *
 * Returns `undefined` when no procedure-contract defines `meta.path`.
 */
export function resolveBasePathMeta(contract: RouterContract, currentPath: string[] = []): string[] | undefined {
  if (contract instanceof ProcedureContract) {
    const path = getPathMeta(contract)

    if (!path) {
      return undefined
    }

    const base = path.slice(0, Math.max(0, path.length - currentPath.length))

    if (currentPath.some((key, i) => path[base.length + i] !== key)) {
      throw new TypeError(
        `Procedure contract at "${currentPath.join('.')}" defines meta.path "${path.join('.')}" that does not match its path inside the given router contract.`,
      )
    }

    return base
  }

  if (isTypescriptObject(contract)) {
    for (const [key, child] of Object.entries(contract)) {
      const base = resolveBasePathMeta(child, [...currentPath, key])

      if (base !== undefined) {
        return base
      }
    }
  }

  return undefined
}
