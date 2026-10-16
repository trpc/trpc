import type { ClientOptions } from '@orpc/client'
import type { AnySchema, InferSchemaInput, InferSchemaOutput, ProcedureContract, Schema } from '@orpc/contract'
import type { JsonSchema } from '@orpc/json-schema'
import type { Context, ProcedureClientOptions } from '@orpc/server'
import type { MaybeOptionalOptions } from '@orpc/shared'
import type { FlexibleSchema, Tool } from 'ai'
import type { FunctionTool } from './tool-meta'
import { getAsyncIteratorObjectSchemaDetails } from '@orpc/contract'
import { combineJsonSchemasWithComposition } from '@orpc/json-schema'
import { call, Procedure } from '@orpc/server'
import { isAsyncGeneratorFunction, mergeTwoLevels, ORPC_NAME, resolveMaybeOptionalOptions, toArray } from '@orpc/shared'
import { tool } from 'ai'
import { getAiSdkToolMeta } from './tool-meta'

const ANY_SCHEMA: FlexibleSchema = {
  '~standard': {
    vendor: ORPC_NAME,
    version: 1,
    validate: (value: unknown) => ({ value }),
    jsonSchema: {
      input: () => ({}),
      output: () => ({}),
    },
  },
}

function combineJsonSchemas(jsonSchemas: Record<string, unknown>[]): Record<string, unknown> {
  let $schema: unknown

  const branches = jsonSchemas.map((jsonSchema) => {
    if ('$schema' in jsonSchema) {
      const { $schema: branch$schema, ...rest } = jsonSchema
      $schema ??= branch$schema
      return rest
    }

    return jsonSchema
  })

  const combined = combineJsonSchemasWithComposition('allOf', branches as JsonSchema[]) as Record<string, unknown>

  return { $schema, ...combined }
}

function combineSchemas(schemas: AnySchema[], merge: boolean): undefined | FlexibleSchema {
  if (schemas.length === 0) {
    return undefined
  }

  if (schemas.length === 1) {
    return schemas[0]!
  }

  type MaybeStandardJsonSchema = AnySchema & Extract<FlexibleSchema, { '~standard': { jsonSchema?: object } }>

  const standardJsonSchemas = (schemas as MaybeStandardJsonSchema[])
    .filter(schema => schema['~standard'].jsonSchema)

  const jsonSchema: MaybeStandardJsonSchema['~standard']['jsonSchema'] = standardJsonSchemas.length
    ? {
        input: options => combineJsonSchemas(standardJsonSchemas.map(schema => schema['~standard'].jsonSchema!.input(options))),
        output: options => combineJsonSchemas(standardJsonSchemas.map(schema => schema['~standard'].jsonSchema!.output(options))),
      }
    : undefined

  return {
    '~standard': {
      vendor: ORPC_NAME,
      version: 1,
      async validate(value: unknown) {
        let current = value

        // Mirrors the server's stacked input validation, output schemas stay piped.
        for (const [index, schema] of schemas.entries()) {
          const merging = merge && index !== 0
          const result = await schema['~standard'].validate(merging ? mergeTwoLevels(value, current) : current)

          if (result.issues) {
            return result
          }

          current = merging ? mergeTwoLevels(current, result.value) : result.value
        }

        return { value: current }
      },
      jsonSchema,
    },
  }
}

function getIteratorYieldSchemas(schemas: AnySchema[]): AnySchema[] | undefined {
  if (schemas.length === 0) {
    return undefined
  }

  const yieldSchemas: AnySchema[] = []

  for (const schema of schemas) {
    const details = getAsyncIteratorObjectSchemaDetails(schema)

    if (!details) {
      return undefined
    }

    yieldSchemas.push(details.yieldSchema)
  }

  return yieldSchemas
}

function combineOutputSchemas(outputSchemas: AnySchema[]): FlexibleSchema | undefined {
  const yieldSchemas = getIteratorYieldSchemas(outputSchemas)
  return combineSchemas([...(yieldSchemas ?? outputSchemas)].reverse(), false)
}

/**
 * Infers the value an AI SDK tool outputs for a given oRPC output type.
 *
 * For [AsyncIteratorObject](https://orpc.dev/docs/async-iterator-object) outputs, the tool streams
 * each yielded event as a [preliminary result](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling#preliminary-tool-results)
 * and the last event becomes the final result, so the tool output is the yield type.
 *
 * @see {@link https://orpc.dev/docs/integrations/ai-sdk#streaming-tool-outputs | AI SDK Integration - Streaming Tool Outputs}
 */
export type ToolOutput<T> = T extends AsyncIteratorObject<infer TYield, any, any>
  ? TYield
  : T

export interface ImplementToolFactoryOptions {
  // TODO: add a `converter` option after JSON Schema converters support synchronous conversion,
  // because the AI SDK reads JSON Schemas synchronously
}

export interface ToolImplementer {
  <TInputSchema extends AnySchema, TOutputSchema extends AnySchema>(
    contract: ProcedureContract<TInputSchema, TOutputSchema, any>,
    ...rest: MaybeOptionalOptions<Omit<FunctionTool<InferSchemaOutput<TInputSchema>, ToolOutput<InferSchemaInput<TOutputSchema>>>, 'inputSchema' | 'outputSchema'>>
  ): Tool<InferSchemaOutput<TInputSchema>, ToolOutput<InferSchemaInput<TOutputSchema>>>
}

/**
 * Creates a builder that implements [procedure contracts](https://orpc.dev/docs/contract/procedure)
 * as [AI SDK Tools](https://ai-sdk.dev/docs/foundations/tools) by leveraging existing contract definitions.
 *
 * The factory accepts oRPC related options, and the resulting builder
 * accepts a contract alongside AI SDK tool options.
 *
 * @remarks
 * **Note**: [Procedures](https://orpc.dev/docs/procedure) are also compatible with [procedure contracts](https://orpc.dev/docs/contract/procedure).
 *
 * @example
 * ```ts
 * import { aiSdkTool, implementToolFactory } from '@orpc/ai-sdk'
 * import { oc } from '@orpc/contract'
 *
 * const getWeatherContract = oc
 *   .meta(
 *     aiSdkTool({ description: 'Get the weather in a location' }), // default AI SDK tool options
 *   )
 *   .input(
 *     z.object({
 *       location: z.string().describe('The location to get the weather for'),
 *     }),
 *   )
 *   .output(
 *     z.object({
 *       location: z.string().describe('The location the weather is for'),
 *       temperature: z.number().describe('The temperature in Celsius'),
 *     }),
 *   )
 *
 * const implementTool = implementToolFactory()
 *
 * const getWeatherTool = implementTool(getWeatherContract, {
 *   execute: async ({ location }) => ({
 *     location,
 *     temperature: 72 + Math.floor(Math.random() * 21) - 10,
 *   }),
 * })
 * ```
 *
 * @see {@link https://orpc.dev/docs/integrations/ai-sdk#tool-implementer | AI SDK Integration - Tool Implementer}
 */
export function implementToolFactory(_options: ImplementToolFactoryOptions = {}): ToolImplementer {
  const factory: ToolImplementer = (contract, ...rest) => {
    const toolOptions = resolveMaybeOptionalOptions(rest)

    const inputSchemas = toArray(contract['~orpc'].inputSchemas)
    const outputSchemas = toArray(contract['~orpc'].outputSchemas)

    const defaults = getAiSdkToolMeta(contract)

    return tool({
      ...defaults,
      ...toolOptions,
      inputSchema: combineSchemas(inputSchemas, true) ?? ANY_SCHEMA,
      outputSchema: combineOutputSchemas(outputSchemas),
    })
  }

  return factory
}

export type CreateToolFactoryOptions<TInitialContext extends Context>
  = & ImplementToolFactoryOptions
    & ProcedureClientOptions<TInitialContext, Schema<unknown>, object, object>
    & Omit<ClientOptions<object>, 'context' | 'signal'>

export interface ToolFactory<TInitialContext extends Context> {
  <TInputSchema extends AnySchema, TOutputSchema extends AnySchema>(
    procedure: Procedure<TInitialContext, any, TInputSchema, TOutputSchema, any>,
    ...rest: MaybeOptionalOptions<Omit<FunctionTool<InferSchemaOutput<TInputSchema>, ToolOutput<InferSchemaInput<TOutputSchema>>>, 'inputSchema' | 'outputSchema' | 'execute'>>
  ): Tool<InferSchemaOutput<TInputSchema>, ToolOutput<InferSchemaInput<TOutputSchema>>>
}

/**
 * Creates a builder that converts [procedures](https://orpc.dev/docs/procedure)
 * into [AI SDK Tools](https://ai-sdk.dev/docs/foundations/tools) by leveraging existing procedure definitions.
 *
 * The factory accepts oRPC related options, and the resulting builder
 * accepts a procedure alongside AI SDK tool options.
 *
 * @example
 * ```ts
 * import { aiSdkTool, createToolFactory } from '@orpc/ai-sdk'
 * import { os } from '@orpc/server'
 *
 * const getWeatherProcedure = os
 *   .meta(
 *     aiSdkTool({ description: 'Get the weather in a location' }), // default AI SDK tool options
 *   )
 *   .input(z.object({
 *     location: z.string().describe('The location to get the weather for'),
 *   }))
 *   .output(z.object({
 *     location: z.string().describe('The location the weather is for'),
 *     temperature: z.number().describe('The temperature in Celsius'),
 *   }))
 *   .handler(async ({ input }) => ({
 *     location: input.location,
 *     temperature: 72 + Math.floor(Math.random() * 21) - 10,
 *   }))
 *
 * const createTool = createToolFactory({
 *   context: {}, // provide initial context if needed
 * })
 *
 * const getWeatherTool = createTool(getWeatherProcedure, {
 *   // ...AI SDK tool options/overrides here if needed
 * })
 * ```
 *
 * @see {@link https://orpc.dev/docs/integrations/ai-sdk#tool-factory | AI SDK Integration - Tool Factory}
 */
export function createToolFactory<TInitialContext extends Context = object>(
  ...rest: MaybeOptionalOptions<CreateToolFactoryOptions<TInitialContext>>
): ToolFactory<TInitialContext> {
  const options = resolveMaybeOptionalOptions(rest)
  const implementTool = implementToolFactory(options)

  const factory: ToolFactory<TInitialContext> = (procedure, ...rest) => {
    const toolOptions = resolveMaybeOptionalOptions(rest)

    /**
     * The AI SDK already validates input against the tool's `inputSchema`,
     * so input validation is disabled at the oRPC level to avoid validating twice.
     * Output validation stays enabled because the AI SDK does not validate
     * the value returned from `execute` against the tool's `outputSchema`.
     */
    const disabledValidation = new Procedure({
      ...procedure['~orpc'],
      disableInputValidation: true,
    })

    /**
     * Output schemas are the source of truth, but an `async function*` handler always
     * returns an async iterator, so it streams even without an `asyncIteratorObject` schema.
     */
    const isIteratorOutput = getIteratorYieldSchemas(toArray(procedure['~orpc'].outputSchemas)) !== undefined
      || isAsyncGeneratorFunction(procedure['~orpc'].handler)

    return implementTool(procedure, {
      ...toolOptions as any,
      /**
       * For async iterator outputs, the tool streams each event as a
       * [preliminary result](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling#preliminary-tool-results),
       * and the last event becomes the final result.
       */
      execute: isIteratorOutput
        ? async function* (input, callingOptions) {
          yield* await call(disabledValidation, input as any, { ...options, signal: callingOptions.abortSignal }) as AsyncIterable<any>
        }
        : (input, callingOptions) => {
            return call(disabledValidation, input as any, { ...options, signal: callingOptions.abortSignal })
          },
    }) as any
  }

  return factory
}
