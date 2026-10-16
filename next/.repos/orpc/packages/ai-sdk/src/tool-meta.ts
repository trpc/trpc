import type { AnyProcedureContract, AnySchema, ErrorMap, InferSchemaInput, InferSchemaOutput, MetaPlugin } from '@orpc/contract'
import type { Lazy } from '@orpc/server'
import type { JSONValue, Tool } from 'ai'
import type { ToolOutput } from './tool'

/**
 * The [function tool](https://ai-sdk.dev/docs/foundations/tools) member of the AI SDK `Tool` union,
 * which is the kind of tool this package produces.
 */
export type FunctionTool<
  INPUT extends JSONValue | unknown | never = any,
  OUTPUT extends JSONValue | unknown | never = any,
> = Extract<Tool<INPUT, OUTPUT>, { type?: 'function' | undefined }>

/**
 * Base [AI SDK Tool](https://ai-sdk.dev/docs/foundations/tools) options attached to a procedure/contract,
 * used as defaults when creating tools from it.
 *
 * @remarks
 * **Note**: When defined multiple times, options are overridden by the most recent call.
 *
 * @see {@link https://orpc.dev/docs/integrations/ai-sdk#tool-implementer | AI SDK Integration - Tool Implementer}
 */
export type AiSdkToolMeta<
  TInputSchema extends AnySchema = AnySchema,
  TOutputSchema extends AnySchema = AnySchema,
> = Partial<Omit<
  FunctionTool<InferSchemaOutput<TInputSchema>, ToolOutput<InferSchemaInput<TOutputSchema>>>,
  'inputSchema' | 'outputSchema' | 'execute'
>>

export interface AiSdkToolMetaPlugin<
  TInputSchema extends AnySchema,
  TOutputSchema extends AnySchema,
  TErrorMap extends ErrorMap,
> extends MetaPlugin<TInputSchema, TOutputSchema, TErrorMap> {
  name: '~ai-sdk/tool'
}

export interface AiSdkToolFunction {
  <TInputSchema extends AnySchema, TOutputSchema extends AnySchema, TErrorMap extends ErrorMap>(
    meta: AiSdkToolMeta<TInputSchema, TOutputSchema>,
  ): AiSdkToolMetaPlugin<TInputSchema, TOutputSchema, TErrorMap>
}

/**
 * Attaches base [AI SDK Tool](https://ai-sdk.dev/docs/foundations/tools) options to a procedure/contract,
 * used as defaults when creating tools from it.
 *
 * @remarks
 * **Note**: When defined multiple times, options are overridden by the most recent call.
 *
 * @example
 * ```ts
 * const getWeatherContract = oc
 *   .meta(aiSdkTool({
 *     description: 'Get the weather in a location',
 *     metadata: { source: 'weather-service' },
 *   }))
 *   .input(z.object({ location: z.string() }))
 * ```
 *
 * @see {@link https://orpc.dev/docs/integrations/ai-sdk#tool-implementer | AI SDK Integration - Tool Implementer}
 */
export const aiSdkTool: AiSdkToolFunction = incoming => ({
  name: '~ai-sdk/tool',
  init(meta) {
    const existing = meta['~ai-sdk/tool'] as undefined | AiSdkToolMeta

    return {
      ...meta,
      '~ai-sdk/tool': { ...existing, ...incoming },
    }
  },
})

/**
 * Reads the base [AI SDK Tool](https://ai-sdk.dev/docs/foundations/tools) options
 * attached to a procedure/contract by {@link aiSdkTool}.
 *
 * @see {@link https://orpc.dev/docs/integrations/ai-sdk#tool-implementer | AI SDK Integration - Tool Implementer}
 */
export function getAiSdkToolMeta(procedureOrLazy: AnyProcedureContract | Lazy<any>): AiSdkToolMeta | undefined {
  return procedureOrLazy['~orpc'].meta['~ai-sdk/tool'] as AiSdkToolMeta | undefined
}
