import type { AnyNestedClient, ClientContext, InferClientContext, InferClientError } from '@orpc/client'
import type { AnySchema, ErrorMap, InferSchemaInput, InferSchemaOutput, Meta, MetaPlugin, ORPCErrorFromErrorMap, RouterContract } from '@orpc/contract'
import type { ThrowableError } from '@orpc/shared'
import type { RouterUtilsPlugin } from './plugin'
import type { ProcedureUtilsOptions } from './procedure-utils'
import { getRouterContract, ProcedureContract } from '@orpc/contract'
import { mergeProcedureUtilsOptions } from './procedure-utils'

export type PiniaColadaMetaOptions<TClientContext extends ClientContext, TInput, TOutput, TError>
  = Omit<ProcedureUtilsOptions<TClientContext, TInput, TOutput, TError>, 'prefix'>

export interface PiniaColadaMetaPlugin<
  TInputSchema extends AnySchema,
  TOutputSchema extends AnySchema,
  TErrorMap extends ErrorMap,
> extends MetaPlugin<TInputSchema, TOutputSchema, TErrorMap> {
  name: '~pinia-colada'
}

/**
 * Define base Pinia Colada options and interceptors on a procedure contract.
 * Applied multiple times, later options are spread-merged with higher priority
 * while interceptors are concatenated. A key explicitly set to `undefined`
 * resets the value from earlier applications instead of merging.
 *
 * Apply them to router utils with {@link ContractOptionsUtilsPlugin}.
 *
 * @see {@link https://orpc.dev/docs/integrations/pinia-colada#contract-options-plugin | Pinia Colada Integration - Contract Options Plugin}
 */
export function piniaColada<
  TInputSchema extends AnySchema,
  TOutputSchema extends AnySchema,
  TErrorMap extends ErrorMap,
>(
  options: PiniaColadaMetaOptions<
    ClientContext,
    InferSchemaInput<TInputSchema>,
    InferSchemaOutput<TOutputSchema>,
    ORPCErrorFromErrorMap<TErrorMap> | ThrowableError
  >,
): PiniaColadaMetaPlugin<TInputSchema, TOutputSchema, TErrorMap> {
  return {
    name: '~pinia-colada',
    init(meta) {
      const current = meta['~pinia-colada'] as ProcedureUtilsOptions<ClientContext, any, any, any> | undefined

      return {
        ...meta,
        '~pinia-colada': current ? mergeProcedureUtilsOptions(current, options) : options,
      }
    },
  }
}

export function getPiniaColadaMeta(
  procedureOrLazy: { '~orpc': { meta: Meta } },
): PiniaColadaMetaOptions<ClientContext, unknown, unknown, ThrowableError> | undefined {
  return procedureOrLazy['~orpc'].meta['~pinia-colada'] as PiniaColadaMetaOptions<ClientContext, unknown, unknown, ThrowableError> | undefined
}

/**
 * Router utils plugin that applies base options defined via {@link piniaColada}
 * on the given router contract. Meta options act as the base layer: options defined
 * on the utils override them, and utils interceptors run after meta interceptors.
 *
 * The contract shape must match the client the utils are created from,
 * so pass the root router contract when utils paths start from the root.
 *
 * @see {@link https://orpc.dev/docs/integrations/pinia-colada#contract-options-plugin | Pinia Colada Integration - Contract Options Plugin}
 */
export class ContractOptionsUtilsPlugin<T extends AnyNestedClient = AnyNestedClient> implements RouterUtilsPlugin<T> {
  readonly name = '~contract-options'

  constructor(
    private readonly contract: RouterContract,
  ) {}

  initProcedureOptions(
    path: string[],
    options: ProcedureUtilsOptions<InferClientContext<T>, any, any, InferClientError<T>>,
  ): ProcedureUtilsOptions<InferClientContext<T>, any, any, InferClientError<T>> {
    const procedure = getRouterContract(this.contract, path)

    if (!(procedure instanceof ProcedureContract)) {
      return options
    }

    const base = getPiniaColadaMeta(procedure)

    if (!base) {
      return options
    }

    return mergeProcedureUtilsOptions(base as any, options)
  }
}
