import type { AnySchema, ErrorMap, MergedSchema, Schema } from '@orpc/contract'
import type { Context } from '@orpc/server'
import { ContractBuilder } from '@orpc/contract'
import { Builder } from '@orpc/server'
import { Schema as EffectSchema } from 'effect'
import { toStandardSchema } from '../schema'

function isEffectConstraintDecoder(
  schema: AnySchema | EffectSchema.ConstraintDecoder<any>,
): schema is EffectSchema.ConstraintDecoder<any> {
  return EffectSchema.isSchema(schema)
}

declare module '@orpc/contract' {
  interface ContractBuilder<
    TErrorMap extends ErrorMap,
  > {
    input<S extends EffectSchema.ConstraintDecoder<any>>(
      schema: S,
    ): ProcedureContractBuilderWithInput<Schema<S['Encoded'], S['Type']>, TErrorMap>

    output<S extends EffectSchema.ConstraintDecoder<any>>(
      schema: S,
    ): ProcedureContractBuilderWithOutput<Schema<S['Encoded'], S['Type']>, TErrorMap>
  }

  interface ProcedureContractBuilderWithInput<
    TInputSchema extends AnySchema,
    TErrorMap extends ErrorMap,
  > {
    input<S extends EffectSchema.ConstraintDecoder<any>>(
      schema: S,
    ): ProcedureContractBuilderWithInput<MergedSchema<Schema<S['Encoded'], S['Type']>, TInputSchema>, TErrorMap>

    output<S extends EffectSchema.ConstraintDecoder<any>>(
      schema: S,
    ): ProcedureContractBuilderWithInputOutput<TInputSchema, Schema<S['Encoded'], S['Type']>, TErrorMap>
  }

  interface ProcedureContractBuilderWithOutput<
    TOutputSchema extends AnySchema,
    TErrorMap extends ErrorMap,
  > {
    input<S extends EffectSchema.ConstraintDecoder<any>>(
      schema: S,
    ): ProcedureContractBuilderWithInputOutput<Schema<S['Encoded'], S['Type']>, TOutputSchema, TErrorMap>

    output<S extends EffectSchema.ConstraintDecoder<any>>(
      schema: S,
    ): ProcedureContractBuilderWithOutput<MergedSchema<Schema<S['Encoded'], S['Type']>, TOutputSchema>, TErrorMap>
  }

  interface ProcedureContractBuilderWithInputOutput<
    TInputSchema extends AnySchema,
    TOutputSchema extends AnySchema,
    TErrorMap extends ErrorMap,
  > {
    input<S extends EffectSchema.ConstraintDecoder<any>>(
      schema: S,
    ): ProcedureContractBuilderWithInputOutput<MergedSchema<Schema<S['Encoded'], S['Type']>, TInputSchema>, TOutputSchema, TErrorMap>

    output<S extends EffectSchema.ConstraintDecoder<any>>(
      schema: S,
    ): ProcedureContractBuilderWithInputOutput<TInputSchema, MergedSchema<Schema<S['Encoded'], S['Type']>, TOutputSchema>, TErrorMap>
  }
}

const OriginalContractBuilderInput = ContractBuilder.prototype.input
ContractBuilder.prototype.input = function input(schema: AnySchema | EffectSchema.ConstraintDecoder<any>) {
  return OriginalContractBuilderInput.bind(this)(isEffectConstraintDecoder(schema) ? toStandardSchema(schema) : schema)
}

const OriginalContractBuilderOutput = ContractBuilder.prototype.output
ContractBuilder.prototype.output = function output(schema: AnySchema | EffectSchema.ConstraintDecoder<any>) {
  return OriginalContractBuilderOutput.bind(this)(isEffectConstraintDecoder(schema) ? toStandardSchema(schema) : schema)
}

declare module '@orpc/server' {
  interface Builder<
    TInitialContext extends Context,
    TErrorMap extends ErrorMap,
  > {
    input<S extends EffectSchema.ConstraintDecoder<any>>(
      schema: S,
    ): BuilderWithInput<TInitialContext, object, Schema<S['Encoded'], S['Type']>, TErrorMap>

    output<S extends EffectSchema.ConstraintDecoder<any>>(
      schema: S,
    ): BuilderWithOutput<TInitialContext, object, Schema<S['Encoded'], S['Type']>, TErrorMap>
  }

  interface BuilderWithMiddlewares<
    TInitialContext extends Context,
    TInjectedContext extends Context,
    TErrorMap extends ErrorMap,
  > {
    input<S extends EffectSchema.ConstraintDecoder<any>>(
      schema: S,
    ): BuilderWithInput<TInitialContext, TInjectedContext, Schema<S['Encoded'], S['Type']>, TErrorMap>

    output<S extends EffectSchema.ConstraintDecoder<any>>(
      schema: S,
    ): BuilderWithOutput<TInitialContext, TInjectedContext, Schema<S['Encoded'], S['Type']>, TErrorMap>
  }

  interface BuilderWithInput<
    TInitialContext extends Context,
    TInjectedContext extends Context,
    TInputSchema extends AnySchema,
    TErrorMap extends ErrorMap,
  > {
    input<S extends EffectSchema.ConstraintDecoder<any>>(
      schema: S,
    ): BuilderWithInput<TInitialContext, TInjectedContext, MergedSchema<Schema<S['Encoded'], S['Type']>, TInputSchema>, TErrorMap>

    output<S extends EffectSchema.ConstraintDecoder<any>>(
      schema: S,
    ): BuilderWithInputOutput<TInitialContext, TInjectedContext, TInputSchema, Schema<S['Encoded'], S['Type']>, TErrorMap>
  }

  interface BuilderWithOutput<
    TInitialContext extends Context,
    TInjectedContext extends Context,
    TOutputSchema extends AnySchema,
    TErrorMap extends ErrorMap,
  > {
    input<S extends EffectSchema.ConstraintDecoder<any>>(
      schema: S,
    ): BuilderWithInputOutput<TInitialContext, TInjectedContext, Schema<S['Encoded'], S['Type']>, TOutputSchema, TErrorMap>

    output<S extends EffectSchema.ConstraintDecoder<any>>(
      schema: S,
    ): BuilderWithOutput<TInitialContext, TInjectedContext, MergedSchema<Schema<S['Encoded'], S['Type']>, TOutputSchema>, TErrorMap>
  }

  interface BuilderWithInputOutput<
    TInitialContext extends Context,
    TInjectedContext extends Context,
    TInputSchema extends AnySchema,
    TOutputSchema extends AnySchema,
    TErrorMap extends ErrorMap,
  > {
    input<S extends EffectSchema.ConstraintDecoder<any>>(
      schema: S,
    ): BuilderWithInputOutput<TInitialContext, TInjectedContext, MergedSchema<Schema<S['Encoded'], S['Type']>, TInputSchema>, TOutputSchema, TErrorMap>

    output<S extends EffectSchema.ConstraintDecoder<any>>(
      schema: S,
    ): BuilderWithInputOutput<TInitialContext, TInjectedContext, TInputSchema, MergedSchema<Schema<S['Encoded'], S['Type']>, TOutputSchema>, TErrorMap>

  }
}

const OriginalBuilderInput = Builder.prototype.input
Builder.prototype.input = function input(schema: AnySchema | EffectSchema.ConstraintDecoder<any>) {
  return OriginalBuilderInput.bind(this)(isEffectConstraintDecoder(schema) ? toStandardSchema(schema) : schema)
}

const OriginalBuilderOutput = Builder.prototype.output
Builder.prototype.output = function output(schema: AnySchema | EffectSchema.ConstraintDecoder<any>) {
  return OriginalBuilderOutput.bind(this)(isEffectConstraintDecoder(schema) ? toStandardSchema(schema) : schema)
}
