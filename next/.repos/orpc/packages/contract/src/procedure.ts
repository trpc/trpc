import type { ErrorMap } from './error'
import type { AnyMetaPlugin, Meta } from './meta'
import type { AnySchema } from './schema'
import { getConstructor, isTypescriptObject } from '@orpc/shared'

export interface ProcedureContractDefinition<
  TInputSchema extends AnySchema,
  TOutputSchema extends AnySchema,
  TErrorMap extends ErrorMap,
> {
  __TInputSchema?: { type: TInputSchema }
  __TOutputSchema?: { type: TOutputSchema }

  /**
   * Non-serializable should be optional
   */
  inputSchemas?: AnySchema[] | undefined
  outputSchemas?: AnySchema[] | undefined
  metaPlugins?: AnyMetaPlugin[] | undefined
  errorMap: TErrorMap
  meta: Meta
}

export class ProcedureContract<
  TInputSchema extends AnySchema,
  TOutputSchema extends AnySchema,
  TErrorMap extends ErrorMap,
> {
  '~orpc': ProcedureContractDefinition<TInputSchema, TOutputSchema, TErrorMap>

  constructor(def: ProcedureContractDefinition<TInputSchema, TOutputSchema, TErrorMap>) {
    this['~orpc'] = def
  }

  /**
   * Checks if the given instance satisfies the {@link ProcedureContract} class/interface.
   */
  static [Symbol.hasInstance](instance: unknown): boolean {
    if (this !== ProcedureContract) {
      // fallback to default instanceof check if this is extended class
      return Function.prototype[Symbol.hasInstance].call(this, instance)
    }

    const constructor = getConstructor(instance)
    if (constructor === ProcedureContract) {
      return true
    }

    return (
      isTypescriptObject(instance)
      && isTypescriptObject(instance['~orpc'])
      && isTypescriptObject(instance['~orpc'].errorMap)
      && isTypescriptObject(instance['~orpc'].meta)
      && (instance['~orpc'].inputSchemas === undefined || Array.isArray(instance['~orpc'].inputSchemas))
      && (instance['~orpc'].outputSchemas === undefined || Array.isArray(instance['~orpc'].outputSchemas))
    )
  }
}

export type AnyProcedureContract = ProcedureContract<any, any, any>
