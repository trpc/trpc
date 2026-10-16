import type { ProcedureContractBuilderWithInput, ProcedureContractBuilderWithOutput } from './builder-variants'
import type { ErrorMap } from './error'
import type { MergedErrorMap } from './error-utils'
import type { MetaPlugin } from './meta'
import type { ProcedureContractDefinition } from './procedure'
import type { RouterContract } from './router'
import type { AugmentedContractRouter } from './router-utils'
import type { AnySchema, Schema } from './schema'
import { toArray } from '@orpc/shared'
import { mergeErrorMap } from './error-utils'
import { getHiddenMetaPlugins } from './meta'
import { resolveMetaPlugins } from './meta-utils'
import { ProcedureContract } from './procedure'
import { augmentContractRouter } from './router-utils'

/**
 * The input schema type used before `.input` is called.
 * Input is `void` for better compatibility with third-party libraries,
 * such as TanStack Query, which allow calling mutations without input.
 */
export type InitialInputSchema = Schema<void, unknown>

/**
 * The output schema type used before `.output` is called.
 */
export type InitialOutputSchema = Schema<unknown>

/**
 * The contract builder behind `oc`. Chain its methods to define procedure
 * contracts — metadata, errors, and input/output schemas — without any
 * business logic.
 *
 * @see {@link https://orpc.dev/docs/contract/procedure | Procedure Contract}
 */
export class ContractBuilder<
  TErrorMap extends ErrorMap,
> extends ProcedureContract<InitialInputSchema, InitialOutputSchema, TErrorMap> {
  /**
   * Private constructor to prevent direct instantiation.
   * Use the static `create` method to initialize a new instance with a safe initial definition.
   */
  private constructor(definition: ProcedureContractDefinition<InitialInputSchema, InitialOutputSchema, TErrorMap>) {
    super(definition)
  }

  /**
   * Creates a fresh contract builder with an empty definition.
   * Prefer the exported `oc` instance over calling this directly.
   *
   * @see {@link https://orpc.dev/docs/contract/procedure | Procedure Contract}
   */
  static create(): ContractBuilder<object> {
    return new ContractBuilder({
      errorMap: {},
      meta: {},
    })
  }

  /**
   * Applies metadata plugins to contracts built from this builder.
   *
   * @see {@link https://orpc.dev/docs/contract/procedure#metadata | Procedure Contract - Metadata}
   */
  meta(
    ...plugins: MetaPlugin<InitialInputSchema, InitialOutputSchema, TErrorMap>[]
  ): ContractBuilder<TErrorMap> {
    const [meta, metaPlugins] = resolveMetaPlugins(
      this['~orpc'].meta,
      this['~orpc'].metaPlugins,
      plugins,
    )

    return new ContractBuilder({
      ...this['~orpc'],
      meta,
      metaPlugins,
    }) as any
  }

  /**
   * Defines typesafe errors that implementations of this contract can throw.
   *
   * @see {@link https://orpc.dev/docs/contract/procedure#typesafe-errors | Procedure Contract - Typesafe Errors}
   */
  errors<T extends ErrorMap>(
    errors: T,
  ): ContractBuilder<MergedErrorMap<TErrorMap, T>> {
    let result = new ContractBuilder({
      ...this['~orpc'],
      errorMap: mergeErrorMap(this['~orpc'].errorMap, errors),
    })

    const plugins = getHiddenMetaPlugins(errors)
    if (plugins) {
      result = result.meta(...plugins) as any
    }

    return result as any
  }

  /**
   * Defines the input schema used to validate and type the procedure input.
   *
   * @see {@link https://orpc.dev/docs/contract/procedure#inputoutput-validation | Procedure Contract - Input/Output Validation}
   */
  input<T extends AnySchema>(
    schema: T,
  ): ProcedureContractBuilderWithInput<T, TErrorMap> {
    let result = new ContractBuilder({
      ...this['~orpc'],
      inputSchemas: [...toArray(this['~orpc'].inputSchemas), schema],
    })

    const plugins = getHiddenMetaPlugins(schema)
    if (plugins) {
      result = result.meta(...plugins) as any
    }

    return result as any
  }

  /**
   * Defines the output schema used to validate and type the procedure output.
   *
   * @see {@link https://orpc.dev/docs/contract/procedure#inputoutput-validation | Procedure Contract - Input/Output Validation}
   */
  output<T extends AnySchema>(
    schema: T,
  ): ProcedureContractBuilderWithOutput<T, TErrorMap> {
    let result = new ContractBuilder({
      ...this['~orpc'],
      outputSchemas: [...toArray(this['~orpc'].outputSchemas), schema],
    })

    const plugins = getHiddenMetaPlugins(schema)
    if (plugins) {
      result = result.meta(...plugins) as any
    }

    return result as any
  }

  /**
   * Applies the builder's errors and metadata to every procedure contract in
   * the given router contract.
   *
   * @see {@link https://orpc.dev/docs/contract/router#extending-router | Router Contract - Extending Router}
   */
  router<T extends RouterContract>(
    router: T,
  ): AugmentedContractRouter<T, TErrorMap> {
    return augmentContractRouter(router, this['~orpc'])
  }
}

/**
 * The oRPC contract builder. Chain methods like `.input`, `.errors`, and
 * `.output` to define procedure contracts, then compose them into router
 * contracts.
 *
 * @see {@link https://orpc.dev/docs/contract/procedure | Procedure Contract}
 */
export const oc = ContractBuilder.create()
