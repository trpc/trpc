/**
 * Definitions and helpers for tools that AI models can request during a
 * workflow.
 *
 * A tool names an operation, describes the parameters it accepts, declares
 * successful and failed results, and can require approval before execution.
 * This module supports tools defined by the application, tools built into a
 * provider, and dynamic tools whose schema is known only at runtime. It also
 * includes the shared types and conversion helpers needed by language-model
 * requests, tool handlers, and provider integrations.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Context from "../Context.ts"
import type * as Effect from "../Effect.ts"
import { constFalse, constTrue, identity } from "../Function.ts"
import * as StackTraceLimit from "../internal/stackTraceLimit.ts"
import type * as JsonSchema from "../JsonSchema.ts"
import { pipeArguments } from "../Pipeable.ts"
import * as Predicate from "../Predicate.ts"
import * as Schema from "../Schema.ts"
import * as SchemaAST from "../SchemaAST.ts"
import type * as Struct from "../Struct.ts"
import type * as Types from "../Types.ts"
import * as AiError from "./AiError.ts"
import type { CodecTransformer } from "./LanguageModel.ts"
import type * as Prompt from "./Prompt.ts"

// =============================================================================
// Type Ids
// =============================================================================

/**
 * Runtime type identifier carried by Effect AI tool values.
 *
 * **Details**
 *
 * The tool type guards use this marker, together with more specific markers,
 * to distinguish user-defined, provider-defined, and dynamic tools.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export const TypeId: TypeId = "~effect/ai/Tool"

/**
 * Type-level representation of the Effect AI tool runtime type identifier.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export type TypeId = "~effect/ai/Tool"

/**
 * Runtime type identifier carried by provider-defined tools.
 *
 * **Details**
 *
 * `isProviderDefined` uses this marker to distinguish tools that are built into
 * an AI provider from user-defined and dynamic tools.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export const ProviderDefinedTypeId: ProviderDefinedTypeId = "~effect/ai/Tool/ProviderDefined"

/**
 * Type-level representation of the provider-defined tool runtime type
 * identifier.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export type ProviderDefinedTypeId = "~effect/ai/Tool/ProviderDefined"

/**
 * Runtime type identifier carried by dynamic tools.
 *
 * **Details**
 *
 * `isDynamic` uses this marker to distinguish tools whose schema may be
 * provided at runtime from user-defined and provider-defined tools.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export const DynamicTypeId: DynamicTypeId = "~effect/ai/Tool/Dynamic"

/**
 * Type-level representation of the dynamic tool runtime type identifier.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export type DynamicTypeId = "~effect/ai/Tool/Dynamic"

// =============================================================================
// Models
// =============================================================================

/**
 * The strategy used for handling errors returned from tool call handler
 * execution.
 *
 * **Details**
 *
 * If set to `"error"` (the default), errors that occur during tool call handler
 * execution will be returned in the error channel of the calling effect.
 *
 * If set to `"return"`, errors that occur during tool call handler execution
 * will be captured and returned as part of the tool call result.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type FailureMode = "error" | "return"

/**
 * Context provided to the `needsApproval` function when dynamically
 * determining if a tool requires user approval.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface NeedsApprovalContext {
  /**
   * The unique identifier of the tool call.
   */
  readonly toolCallId: string
  /**
   * The conversation messages leading up to this tool call.
   */
  readonly messages: ReadonlyArray<Prompt.Message>
}

/**
 * Function type for dynamically determining if a tool requires approval.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type NeedsApprovalFunction<Params extends Schema.Constraint> = (
  params: Params["Type"],
  context: NeedsApprovalContext
) => boolean | Effect.Effect<boolean>

/**
 * Specifies whether user approval is required before executing a tool.
 *
 * **Details**
 *
 * Can be:
 * - `boolean`: Static approval requirement
 * - `NeedsApprovalFunction`: Dynamic approval based on parameters/context
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type NeedsApproval<Params extends Schema.Constraint> =
  | boolean
  | NeedsApprovalFunction<Params>

/**
 * A user-defined tool that language models can call to perform actions.
 *
 * **Details**
 *
 * Tools represent actionable capabilities that large language models can invoke
 * to extend their functionality beyond text generation. Each tool has a defined
 * schema for parameters, results, and failures.
 *
 * **Example** (Defining a weather lookup tool)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 * import { Tool } from "effect/ai"
 *
 * // Create a weather lookup tool
 * const GetWeather = Tool.make("GetWeather", {
 *   description: "Get current weather for a location",
 *   parameters: Schema.Struct({
 *     location: Schema.String,
 *     units: Schema.Literals(["celsius", "fahrenheit"])
 *   }),
 *   success: Schema.Struct({
 *     temperature: Schema.Number,
 *     condition: Schema.String,
 *     humidity: Schema.Number
 *   })
 * })
 * const result = [GetWeather.name, GetWeather.failureMode] // => ["GetWeather", "error"]
 * ```
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Tool<
  out Name extends string,
  out Config extends {
    readonly parameters: Schema.Constraint
    readonly success: Schema.Constraint
    readonly failure: Schema.Constraint
    readonly failureMode: FailureMode
  },
  out Requirements = never
> {
  readonly [TypeId]: {
    readonly _Requirements: Types.Covariant<Requirements>
  }

  /**
   * The tool identifier which is used to uniquely identify the tool.
   */
  readonly id: string

  /**
   * The name of the tool.
   */
  readonly name: Name

  /**
   * The optional description of the tool.
   */
  readonly description?: string | undefined

  /**
   * The strategy used for handling errors returned from tool call handler
   * execution.
   *
   * **Details**
   *
   * If set to `"error"` (the default), errors that occur during tool call
   * handler execution will be returned in the error channel of the calling
   * effect.
   *
   * If set to `"return"`, errors that occur during tool call handler execution
   * will be captured and returned as part of the tool call result.
   */
  readonly failureMode: FailureMode

  /**
   * A `Schema` representing the parameters that a tool must be called with.
   */
  readonly parametersSchema: Config["parameters"]

  /**
   * A `Schema` representing the value that a tool must return when called if
   * the tool call is successful.
   */
  readonly successSchema: Config["success"]

  /**
   * A `Schema` representing the value that a tool must return when called if
   * it fails.
   */
  readonly failureSchema: Config["failure"]

  /**
   * A `Context` containing tool annotations which can store metadata about
   * the tool.
   */
  readonly annotations: Context.Context<never>

  /**
   * Specifies whether user approval is required before executing this tool.
   *
   * **Details**
   *
   * - If `undefined` or `false`, the tool executes immediately.
   * - If `true`, the tool always requires approval.
   * - If a function, it is called with the tool parameters and context to
   *   dynamically determine if approval is needed. The function can return
   *   a boolean or an Effect that resolves to a boolean.
   */
  readonly needsApproval?: boolean | NeedsApprovalFunction<any> | undefined

  /**
   * Set whether user approval is required before executing this tool.
   */
  setNeedsApproval(
    needsApproval: NeedsApproval<Config["parameters"]>
  ): Tool<Name, Config, Requirements>

  /**
   * Adds a _request-level_ dependency which must be provided before the tool
   * call handler can be executed.
   *
   * **Details**
   *
   * This can be useful when you want to enforce that a particular dependency
   * **MUST** be provided to each request to the large language model provider
   * instead of being provided when creating the tool call handler layer.
   */
  addDependency<Identifier, Service>(
    tag: Context.Key<Identifier, Service>
  ): Tool<Name, Config, Identifier | Requirements>

  /**
   * Set the schema to use to validate the result of a tool call when successful.
   */
  setSuccess<SuccessSchema extends Schema.Constraint>(
    schema: SuccessSchema
  ): Tool<
    Name,
    {
      readonly parameters: Config["parameters"]
      readonly success: SuccessSchema
      readonly failure: Config["failure"]
      readonly failureMode: Config["failureMode"]
    },
    Requirements
  >

  /**
   * Set the schema to use to validate the result of a tool call when it fails.
   */
  setFailure<FailureSchema extends Schema.Constraint>(
    schema: FailureSchema
  ): Tool<
    Name,
    {
      readonly parameters: Config["parameters"]
      readonly success: Config["success"]
      readonly failure: FailureSchema
      readonly failureMode: Config["failureMode"]
    },
    Requirements
  >

  /**
   * Set the schema to use to validate the parameters of a tool call.
   */
  setParameters<ParametersSchema extends Schema.Constraint>(
    schema: ParametersSchema
  ): Tool<
    Name,
    {
      readonly parameters: ParametersSchema
      readonly success: Config["success"]
      readonly failure: Config["failure"]
      readonly failureMode: Config["failureMode"]
    },
    Requirements
  >

  /**
   * Add an annotation to the tool.
   */
  annotate<I, S>(tag: Context.Key<I, S>, value: S): Tool<Name, Config, Requirements>

  /**
   * Add many annotations to the tool.
   */
  annotateMerge<I>(context: Context.Context<I>): Tool<Name, Config, Requirements>
}

/**
 * A provider-defined tool is a tool which is built into a large language model
 * provider (e.g. web search, code execution).
 *
 * **Details**
 *
 * These tools are executed by the large language model provider rather than
 * by your application. However, they can optionally require custom handlers
 * implemented in your application to process provider generated results.
 *
 * **Example** (Defining a provider-defined web search tool)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 * import { Tool } from "effect/ai"
 *
 * // Define a web search tool provided by OpenAI
 * const WebSearch = Tool.providerDefined({
 *   id: "openai.web_search",
 *   customName: "OpenAiWebSearch",
 *   providerName: "web_search",
 *   args: Schema.Struct({
 *     query: Schema.String
 *   }),
 *   success: Schema.Struct({
 *     results: Schema.Array(Schema.Struct({
 *       title: Schema.String,
 *       url: Schema.String,
 *       snippet: Schema.String
 *     }))
 *   })
 * })({ query: "Effect" })
 * const result = [WebSearch.name, WebSearch.providerName] // => ["OpenAiWebSearch", "web_search"]
 * ```
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ProviderDefined<
  out Identifier extends `${string}.${string}`,
  out Name extends string,
  out Config extends {
    readonly args: Schema.Constraint
    readonly parameters: Schema.Constraint
    readonly success: Schema.Constraint
    readonly failure: Schema.Constraint
    readonly failureMode: FailureMode
  },
  out RequiresHandler extends boolean = false
> extends
  Tool<
    Name,
    {
      readonly parameters: Config["parameters"]
      readonly success: Config["success"]
      readonly failure: Config["failure"]
      readonly failureMode: Config["failureMode"]
    }
  >
{
  readonly [ProviderDefinedTypeId]: typeof ProviderDefinedTypeId

  /**
   * the identifier which is used to uniquely identify the provider-defined tool.
   */
  readonly id: Identifier

  /**
   * The arguments passed to the provider-defined tool.
   */
  readonly args: Config["args"]["Encoded"]

  /**
   * A `Schema` representing the arguments provided by the end-user which will
   * be used to configure the behavior of the provider-defined tool.
   */
  readonly argsSchema: Config["args"]

  /**
   * Name of the tool as recognized by the large language model provider.
   */
  readonly providerName: string

  /**
   * If set to `true`, this provider-defined tool will require a user-defined
   * tool call handler to be provided when converting the `Toolkit` containing
   * this tool into a `Layer`.
   */
  readonly requiresHandler: RequiresHandler
}

/**
 * A dynamic tool is a tool where the schema may not be known at compile time.
 *
 * **Details**
 *
 * Dynamic tools support two modes:
 * - **Effect Schema mode**: Full type safety with validation (like `Tool.make`)
 * - **JSON Schema mode**: Raw JSON Schema for the model, handler receives `unknown`
 *
 * This enables scenarios such as MCP tools discovered at runtime, user-defined
 * functions loaded from external sources, or plugin systems.
 *
 * **Example** (Defining dynamic tools)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 * import { Tool } from "effect/ai"
 *
 * // Dynamic tool with Effect Schema (typed)
 * const Calculator = Tool.dynamic("Calculator", {
 *   parameters: Schema.Struct({
 *     operation: Schema.Literals(["add", "subtract"]),
 *     a: Schema.Number,
 *     b: Schema.Number
 *   }),
 *   success: Schema.Number
 * })
 *
 * // Dynamic tool with JSON Schema (untyped parameters)
 * const McpTool = Tool.dynamic("McpTool", {
 *   description: "Tool from MCP server",
 *   parameters: {
 *     type: "object",
 *     properties: { query: { type: "string" } },
 *     required: ["query"]
 *   }
 * })
 *
 * const result = [Calculator.name, McpTool.name] // => ["Calculator", "McpTool"]
 * ```
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Dynamic<
  out Name extends string,
  out Config extends {
    readonly parameters: Schema.Constraint | JsonSchema.JsonSchema
    readonly success: Schema.Constraint
    readonly failure: Schema.Constraint
    readonly failureMode: FailureMode
  },
  out Requirements = never
> extends
  Tool<
    Name,
    {
      readonly parameters: Config["parameters"] extends Schema.Constraint ? Config["parameters"] : typeof Schema.Unknown
      readonly success: Config["success"]
      readonly failure: Config["failure"]
      readonly failureMode: Config["failureMode"]
    },
    Requirements
  >
{
  readonly [DynamicTypeId]: typeof DynamicTypeId

  /**
   * The raw JSON Schema for parameters. Present when `parameters` was provided
   * as a JSON Schema, `undefined` when an Effect Schema was used.
   */
  readonly jsonSchema: Config["parameters"] extends Schema.Constraint ? undefined : JsonSchema.JsonSchema
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Type guard to check if a value is a user-defined tool.
 *
 * **Example** (Checking for user-defined tools)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 * import { Tool } from "effect/ai"
 *
 * const UserDefinedTool = Tool.make("Calculator", {
 *   description: "Performs basic arithmetic operations",
 *   parameters: Schema.Struct({
 *     operation: Schema.Literals(["add", "subtract", "multiply", "divide"]),
 *     a: Schema.Number,
 *     b: Schema.Number
 *   }),
 *   success: Schema.Number
 * })
 *
 * const ProviderDefinedTool = Tool.providerDefined({
 *   id: "openai.web_search",
 *   customName: "OpenAiWebSearch",
 *   providerName: "web_search",
 *   args: Schema.Struct({
 *     query: Schema.String
 *   }),
 *   success: Schema.Struct({
 *     results: Schema.Array(Schema.Struct({
 *       title: Schema.String,
 *       url: Schema.String,
 *       snippet: Schema.String
 *     }))
 *   })
 * })
 *
 * const result = [Tool.isUserDefined(UserDefinedTool), Tool.isUserDefined(ProviderDefinedTool)] // => [true, false]
 * ```
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isUserDefined = (u: unknown): u is Tool<string, any, any> =>
  Predicate.hasProperty(u, TypeId) && !isProviderDefined(u) && !isDynamic(u)

/**
 * Type guard to check if a value is a provider-defined tool.
 *
 * **Example** (Checking for provider-defined tools)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 * import { Tool } from "effect/ai"
 *
 * const UserDefinedTool = Tool.make("Calculator", {
 *   description: "Performs basic arithmetic operations",
 *   parameters: Schema.Struct({
 *     operation: Schema.Literals(["add", "subtract", "multiply", "divide"]),
 *     a: Schema.Number,
 *     b: Schema.Number
 *   }),
 *   success: Schema.Number
 * })
 *
 * const ProviderDefinedTool = Tool.providerDefined({
 *   id: "openai.web_search",
 *   customName: "OpenAiWebSearch",
 *   providerName: "web_search",
 *   args: Schema.Struct({
 *     query: Schema.String
 *   }),
 *   success: Schema.Struct({
 *     results: Schema.Array(Schema.Struct({
 *       title: Schema.String,
 *       url: Schema.String,
 *       snippet: Schema.String
 *     }))
 *   })
 * })
 *
 * const result = [Tool.isProviderDefined(UserDefinedTool), Tool.isProviderDefined(ProviderDefinedTool)] // => [false, false]
 * ```
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isProviderDefined = (
  u: unknown
): u is ProviderDefined<`${string}.${string}`, string, any> => Predicate.hasProperty(u, ProviderDefinedTypeId)

/**
 * Type guard to check if a value is a dynamic tool.
 *
 * **Example** (Checking for dynamic tools)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 * import { Tool } from "effect/ai"
 *
 * const DynamicTool = Tool.dynamic("DynamicTool", {
 *   parameters: { type: "object", properties: {} }
 * })
 *
 * const UserDefinedTool = Tool.make("Calculator", {
 *   parameters: Schema.Struct({ a: Schema.Number, b: Schema.Number }),
 *   success: Schema.Number
 * })
 *
 * const result = [Tool.isDynamic(DynamicTool), Tool.isDynamic(UserDefinedTool)] // => [true, false]
 * ```
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isDynamic = (u: unknown): u is Dynamic<string, any> => Predicate.hasProperty(u, DynamicTypeId)

// =============================================================================
// utility types
// =============================================================================

/**
 * A type which represents any `Tool`.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export interface Any extends
  Tool<any, {
    readonly parameters: Schema.Top
    readonly success: Schema.Top
    readonly failure: Schema.Top
    readonly failureMode: FailureMode
  }, any>
{}

/**
 * A type which represents any provider-defined `Tool`.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export interface AnyProviderDefined extends
  ProviderDefined<any, any, {
    readonly args: Schema.Top
    readonly parameters: Schema.Top
    readonly success: Schema.Top
    readonly failure: Schema.Top
    readonly failureMode: FailureMode
  }, any>
{}

/**
 * A type which represents any dynamic `Tool`.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export interface AnyDynamic extends
  Dynamic<any, {
    readonly parameters: Schema.Top | JsonSchema.JsonSchema
    readonly success: Schema.Top
    readonly failure: Schema.Top
    readonly failureMode: FailureMode
  }, any>
{}

// /**
//  * @since 4.0.0
//  * @category utility types
//  */
// export interface AnyStructSchema extends Schema.Top {
//   readonly fields: Schema.Struct.Fields
// }

/**
 * A utility type to extract the `Name` type from an `Tool`.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type Name<T> = T extends Tool<
  infer _Name,
  infer _Config,
  infer _Requirements
> ? _Name
  : never

/**
 * A utility type to extract the type of the tool call parameters.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type Parameters<T> = T extends Tool<
  infer _Name,
  infer _Config,
  infer _Requirements
> ? _Config["parameters"]["Type"]
  : never

/**
 * A utility type to extract the encoded type of the tool call parameters.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type ParametersEncoded<T> = T extends Tool<
  infer _Name,
  infer _Config,
  infer _Requirements
> ? _Config["parameters"]["Encoded"]
  : never

/**
 * A utility type to extract the schema for the parameters which an `Tool`
 * must be called with.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type ParametersSchema<T> = T extends Tool<
  infer _Name,
  infer _Config,
  infer _Requirements
> ? _Config["parameters"]
  : never

/**
 * A utility type to extract the type of the tool call result when it succeeds.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type Success<T> = T extends Tool<
  infer _Name,
  infer _Config,
  infer _Requirements
> ? _Config["success"]["Type"]
  : never

/**
 * A utility type to extract the encoded type of the tool call result when
 * it succeeds.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type SuccessEncoded<T> = T extends Tool<
  infer _Name,
  infer _Config,
  infer _Requirements
> ? _Config["success"]["Encoded"]
  : never

/**
 * A utility type to extract the schema for the return type of a tool call when
 * the tool call succeeds.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type SuccessSchema<T> = T extends Tool<
  infer _Name,
  infer _Config,
  infer _Requirements
> ? _Config["success"]
  : never

/**
 * A utility type to extract the type of the tool call result when it fails.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type Failure<T> = T extends Tool<
  infer _Name,
  infer _Config,
  infer _Requirements
> ? _Config["failure"]["Type"]
  : never

/**
 * A utility type to extract the encoded type of the tool call result when
 * it fails.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type FailureEncoded<T> = T extends Tool<
  infer _Name,
  infer _Config,
  infer _Requirements
> ? _Config["failure"]["Encoded"]
  : never

/**
 * A tool's failure type, plus {@link ExecutionFailure} in both failure modes
 * and `AiError` in `"return"` mode.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type FailureResult<T> = T extends Tool<
  infer _Name,
  infer _Config,
  infer _Requirements
> ? _Config["failureMode"] extends "return" ?
      | _Config["failure"]["Type"]
      | typeof ExecutionFailure.Type
      | AiError.AiError
  : _Config["failure"]["Type"] | typeof ExecutionFailure.Type
  : never

/**
 * The encoded version of `FailureResult`.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type FailureResultEncoded<T> = T extends Tool<
  infer _Name,
  infer _Config,
  infer _Requirements
> ? _Config["failureMode"] extends "return" ?
      | _Config["failure"]["Encoded"]
      | typeof ExecutionFailure.Encoded
      | AiError.AiErrorEncoded
  : _Config["failure"]["Encoded"] | typeof ExecutionFailure.Encoded
  : never

/**
 * A tool's success or {@link FailureResult} type.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type Result<T> = Success<T> | FailureResult<T>

/**
 * The encoded form of {@link Result}.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type ResultEncoded<T> = SuccessEncoded<T> | FailureResultEncoded<T>

/**
 * A utility type to extract the requirements of a `Tool` call handler.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type HandlerServices<T> = T extends Tool<
  infer _Name,
  infer _Config,
  infer _Requirements
> ? // Parameters must be decoded when received from a model
    | _Config["parameters"]["DecodingServices"]
    // A tool call `result`, whether success or failure, is encoded and returned
    // as the `encodedResult` along with the `result`
    | ResultEncodingServices<T>
    // Per-request requirements
    | _Requirements
  : never

/**
 * A utility type to extract the requirements needed to encode the result of
 * a `Tool` call.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type ResultEncodingServices<T> = T extends Tool<
  infer _Name,
  infer _Config,
  infer _Requirements
> ? _Config["success"]["EncodingServices"] | _Config["failure"]["EncodingServices"]
  : never

/**
 * A utility type to extract the requirements needed to decode the result of
 * a `Tool` call.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type ResultDecodingServices<T> = T extends Tool<
  infer _Name,
  infer _Config,
  infer _Requirements
> ? _Config["success"]["DecodingServices"] | _Config["failure"]["DecodingServices"]
  : never

/**
 * Extracts the services required to encode tool parameters.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type ParametersEncodingServices<T> = T extends Tool<
  infer _Name,
  infer _Config,
  infer _Requirements
> ? _Config["parameters"]["EncodingServices"]
  : never

/**
 * Represents an `Tool` that has been implemented within the application.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Handler<Name extends string> {
  readonly _: unique symbol
  readonly name: Name
  readonly context: Context.Context<never>
  readonly handler: (params: any, ctx: any) => Effect.Effect<any, any>
}

/**
 * The phase of handling a tool call that produced a failure.
 *
 * **Details**
 *
 * - `"parameters"`: the tool call arguments failed to decode
 * - `"handler"`: the tool handler itself failed
 * - `"result"`: the handler's output failed to validate or encode
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type FailureOrigin = "parameters" | "handler" | "result"

/**
 * Represents the result of calling the handler for a particular `Tool`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface HandlerResult<Tool extends Any> {
  /**
   * The result of executing the handler for a particular tool.
   */
  readonly result: Result<Tool>
  /**
   * The pre-encoded tool call result of executing the handler for a particular
   * tool as a JSON-serializable value. The encoded result can be incorporated
   * into subsequent requests to the large language model.
   */
  readonly encodedResult: unknown
  /**
   * Whether the result of executing the tool call handler was an error or not.
   */
  readonly isFailure: boolean
  /**
   * Which phase of handling the tool call failed. Present when `isFailure` is
   * `true`.
   */
  readonly failureOrigin?: FailureOrigin
  /**
   * Whether this is a preliminary (intermediate) result or the final result.
   * Preliminary results represent progress updates; only the final result
   * should be used as the authoritative output.
   */
  readonly preliminary: boolean
}

/**
 * Tagged union for incremental handler output.
 *
 * **Details**
 *
 * When a tool handler returns a `Stream`, each emitted value is tagged as
 * either:
 * - `Preliminary`: An intermediate result representing progress
 * - `Final`: The last result, which is the authoritative output
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type HandlerOutput<Success> =
  | { readonly _tag: "Preliminary"; readonly value: Success }
  | { readonly _tag: "Final"; readonly value: Success }

/**
 * A utility type which represents the possible errors that can be raised by
 * a tool call's handler.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type HandlerError<T> = T extends Tool<
  infer _Name,
  infer _Config,
  infer _Requirements
> ? _Config["failureMode"] extends "error" ? _Config["failure"]["Type"] | AiError.AiError
  : never
  : never

/**
 * A utility type to create a union of `Handler` types for all tools in a
 * record.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type HandlersFor<Tools extends Record<string, Any>> = {
  [Name in keyof Tools]: RequiresHandler<Tools[Name]> extends true ? Handler<Tools[Name]["name"]>
    : never
}[keyof Tools]

/**
 * A utility type to determine if the specified tool requires a user-defined
 * handler to be implemented.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type RequiresHandler<Tool extends Any> = Tool extends ProviderDefined<
  infer _Name,
  infer _Config,
  infer _RequiresHandler
> ? _RequiresHandler
  : true

// =============================================================================
// Constructors
// =============================================================================

// Clones a tool while preserving its prototype (and thus its kind, e.g.
// user-defined vs. provider-defined vs. dynamic) and its own properties such
// as `id`. Optional `overrides` replace individual fields on the clone.
const clone = (self: Any, overrides?: Record<string, unknown>): any =>
  Object.assign(Object.create(Object.getPrototypeOf(self)), self, overrides)

const Proto = {
  [TypeId]: { _Requirements: identity },
  pipe() {
    return pipeArguments(this, arguments)
  },
  addDependency(this: Any) {
    return clone(this)
  },
  setParameters(this: Any, parametersSchema: Schema.Constraint) {
    return clone(this, { parametersSchema, jsonSchema: undefined })
  },
  setSuccess(this: Any, successSchema: Schema.Constraint) {
    return clone(this, { successSchema })
  },
  setFailure(this: Any, failureSchema: Schema.Constraint) {
    return clone(this, { failureSchema })
  },
  setNeedsApproval(this: Any, needsApproval: NeedsApproval<any>) {
    return clone(this, { needsApproval })
  },
  annotate<I, S>(this: Any, tag: Context.Key<I, S>, value: S) {
    return clone(this, { annotations: Context.add(this.annotations, tag, value) })
  },
  annotateMerge<I>(this: Any, context: Context.Context<I>) {
    return clone(this, { annotations: Context.merge(this.annotations, context) })
  }
}

const ProviderDefinedProto = {
  ...Proto,
  [ProviderDefinedTypeId]: ProviderDefinedTypeId
}

const DynamicProto = {
  ...Proto,
  [DynamicTypeId]: DynamicTypeId
}

const userDefinedProto = <
  const Name extends string,
  Parameters extends Schema.Constraint,
  Success extends Schema.Constraint,
  Failure extends Schema.Constraint,
  Mode extends FailureMode
>(options: {
  readonly name: Name
  readonly description?: string | undefined
  readonly parametersSchema: Parameters
  readonly successSchema: Success
  readonly failureSchema: Failure
  readonly annotations: Context.Context<never>
  readonly failureMode: Mode
  readonly needsApproval?: NeedsApproval<Parameters> | undefined
}): Tool<
  Name,
  {
    readonly parameters: Parameters
    readonly success: Success
    readonly failure: Failure
    readonly failureMode: Mode
  }
> => {
  const self = Object.assign(Object.create(Proto), options)
  self.id = `effect/ai/Tool/${options.name}`
  return self
}

const providerDefinedProto = <
  const Identifier extends `${string}.${string}`,
  const Name extends string,
  Args extends Schema.Constraint,
  Parameters extends Schema.Constraint,
  Success extends Schema.Constraint,
  Failure extends Schema.Constraint,
  RequiresHandler extends boolean,
  Mode extends FailureMode
>(options: {
  readonly id: Identifier
  readonly name: Name
  readonly providerName: string
  readonly args: Args["Encoded"]
  readonly argsSchema: Args
  readonly requiresHandler: RequiresHandler
  readonly parametersSchema: Parameters
  readonly successSchema: Success
  readonly failureSchema: Failure
  readonly failureMode: FailureMode
}): ProviderDefined<
  Identifier,
  Name,
  {
    readonly args: Args
    readonly parameters: Parameters
    readonly success: Success
    readonly failure: Failure
    readonly failureMode: Mode
  },
  RequiresHandler
> => Object.assign(Object.create(ProviderDefinedProto), { annotations: Context.empty(), ...options })

const dynamicProto = <
  const Name extends string,
  Parameters extends Schema.Constraint | JsonSchema.JsonSchema,
  Success extends Schema.Constraint,
  Failure extends Schema.Constraint,
  Mode extends FailureMode
>(options: {
  readonly name: Name
  readonly description?: string | undefined
  readonly parametersSchema: Parameters
  readonly successSchema: Success
  readonly failureSchema: Failure
  readonly annotations: Context.Context<never>
  readonly failureMode: Mode
  readonly needsApproval?: NeedsApproval<any> | undefined
  readonly jsonSchema: JsonSchema.JsonSchema | undefined
}): Dynamic<
  Name,
  {
    readonly parameters: Parameters
    readonly success: Success
    readonly failure: Failure
    readonly failureMode: Mode
  }
> => {
  const self = Object.assign(Object.create(DynamicProto), options)
  self.id = `effect/ai/Tool/${options.name}`
  return self
}

/**
 * Creates a user-defined tool with the specified name and configuration.
 *
 * **Details**
 *
 * This is the primary constructor for creating custom tools that AI models
 * can call. The tool definition includes parameter validation, success/failure
 * schemas, and optional service dependencies.
 *
 * If a tool accepts no parameters but still needs an explicit empty object
 * schema, use {@link EmptyParams}.
 *
 * **Example** (Creating a tool without parameters)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 * import { Tool } from "effect/ai"
 *
 * // Simple tool with no parameters
 * const GetCurrentTime = Tool.make("GetCurrentTime", {
 *   description: "Returns the current timestamp",
 *   success: Schema.Number
 * })
 * GetCurrentTime.name // => "GetCurrentTime"
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = <
  const Name extends string,
  Parameters extends Schema.Constraint = typeof EmptyParams,
  Success extends Schema.Constraint = typeof Schema.Void,
  Failure extends Schema.Constraint = typeof Schema.Never,
  Mode extends FailureMode | undefined = undefined,
  Dependencies extends Array<Context.Key<any, any> | Context.Key<never, any>> = []
>(name: Name, options?: {
  /**
   * An optional description explaining what the tool does.
   */
  readonly description?: string | undefined
  /**
   * Schema defining the parameters this tool accepts.
   */
  readonly parameters?: Parameters | undefined
  /**
   * Schema for successful tool execution results.
   */
  readonly success?: Success | undefined
  /**
   * Schema for tool execution failures.
   */
  readonly failure?: Failure | undefined
  /**
   * The strategy used for handling errors returned from tool call handler
   * execution.
   *
   * **Details**
   *
   * If set to `"error"` (the default), errors that occur during tool call handler
   * execution will be returned in the error channel of the calling effect.
   *
   * If set to `"return"`, errors that occur during tool call handler execution
   * will be captured and returned as part of the tool call result.
   */
  readonly failureMode?: Mode
  /**
   * Service dependencies required by the tool handler.
   */
  readonly dependencies?: Dependencies | undefined
  /**
   * Specifies whether user approval is required before executing this tool.
   *
   * **Details**
   *
   * - If `undefined` or `false`, the tool executes immediately.
   * - If `true`, the tool always requires approval.
   * - If a function, it is called with the tool parameters and context to
   *   dynamically determine if approval is needed.
   */
  readonly needsApproval?: NeedsApproval<Parameters> | undefined
}): Tool<
  Name,
  {
    readonly parameters: Parameters
    readonly success: Success
    readonly failure: Failure
    readonly failureMode: Mode extends undefined ? "error" : Mode
  },
  Context.Service.Identifier<Dependencies[number]>
> => {
  const successSchema = options?.success ?? Schema.Void
  const failureSchema = options?.failure ?? Schema.Never
  return userDefinedProto({
    name,
    description: options?.description,
    parametersSchema: options?.parameters ?? EmptyParams,
    successSchema,
    failureSchema,
    failureMode: options?.failureMode ?? "error",
    annotations: Context.empty(),
    needsApproval: options?.needsApproval as any
  }) as any
}

/**
 * Creates a dynamic tool that can accept either an Effect Schema or a raw
 * JSON Schema for its parameters.
 *
 * **When to use**
 *
 * Use when you do not know a tool schema at compile time, such as MCP tools
 * discovered at runtime or tools from external configurations.
 *
 * **Details**
 *
 * - When `parameters` is an Effect Schema: full type safety with validation
 * - When `parameters` is a JSON Schema: handler receives `unknown`, no validation
 *
 * **Example** (Creating a dynamic tool)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 * import { Tool } from "effect/ai"
 *
 * // With Effect Schema (typed parameters)
 * const Calculator = Tool.dynamic("Calculator", {
 *   parameters: Schema.Struct({
 *     operation: Schema.Literals(["add", "subtract"]),
 *     a: Schema.Number,
 *     b: Schema.Number
 *   }),
 *   success: Schema.Number
 * })
 *
 * // With JSON Schema (untyped parameters)
 * const McpTool = Tool.dynamic("McpTool", {
 *   description: "Tool from MCP server",
 *   parameters: {
 *     type: "object",
 *     properties: { query: { type: "string" } },
 *     required: ["query"]
 *   }
 * })
 *
 * const result = [Calculator.name, McpTool.name] // => ["Calculator", "McpTool"]
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const dynamic: {
  <
    const Name extends string,
    const Options extends {
      readonly description?: string | undefined
      readonly parameters?: Schema.Constraint | JsonSchema.JsonSchema | undefined
      readonly success?: Schema.Constraint | undefined
      readonly failure?: Schema.Constraint | undefined
      readonly failureMode?: FailureMode | undefined
      readonly needsApproval?: NeedsApproval<any> | undefined
    }
  >(
    name: Name,
    options?: Options
  ): Dynamic<
    Name,
    {
      readonly parameters: Options extends { readonly parameters: infer P } ? P extends Schema.Constraint ? P
        : P extends JsonSchema.JsonSchema ? P
        : typeof Schema.Unknown
        : typeof Schema.Unknown
      readonly success: Options extends { readonly success: infer S extends Schema.Constraint } ? S
        : typeof Schema.Unknown
      readonly failure: Options extends { readonly failure: infer F extends Schema.Constraint } ? F
        : typeof Schema.Never
      readonly failureMode: Options extends { readonly failureMode: infer M extends FailureMode } ? M : "error"
    }
  >
} = <
  const Name extends string,
  const Options extends {
    readonly description?: string | undefined
    readonly parameters?: Schema.Constraint | JsonSchema.JsonSchema | undefined
    readonly success?: Schema.Constraint | undefined
    readonly failure?: Schema.Constraint | undefined
    readonly failureMode?: FailureMode | undefined
    readonly needsApproval?: NeedsApproval<any> | undefined
  }
>(name: Name, options?: Options): any => {
  const successSchema = options?.success ?? Schema.Unknown
  const failureSchema = options?.failure ?? Schema.Never
  const rawParameters = options?.parameters ?? Schema.Unknown
  const isEffectSchema = Schema.isSchema(rawParameters)
  const parametersSchema = isEffectSchema ? rawParameters : Schema.Unknown
  const jsonSchema = isEffectSchema ? undefined : rawParameters as JsonSchema.JsonSchema
  return dynamicProto({
    name,
    description: options?.description,
    parametersSchema,
    successSchema,
    failureSchema,
    failureMode: options?.failureMode ?? "error",
    annotations: Context.empty(),
    needsApproval: options?.needsApproval,
    jsonSchema
  })
}

/**
 * Creates a provider-defined tool which leverages functionality built into a
 * large language model provider (e.g. web search, code execution).
 *
 * **Details**
 *
 * These tools are executed by the large language model provider rather than
 * by your application. However, they can optionally require custom handlers
 * implemented in your application to process provider generated results.
 *
 * **Example** (Creating a provider-defined tool)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 * import { Tool } from "effect/ai"
 *
 * // Web search tool provided by OpenAI
 * const WebSearch = Tool.providerDefined({
 *   id: "openai.web_search",
 *   customName: "OpenAiWebSearch",
 *   providerName: "web_search",
 *   args: Schema.Struct({
 *     query: Schema.String
 *   }),
 *   success: Schema.Struct({
 *     results: Schema.Array(Schema.Struct({
 *       title: Schema.String,
 *       url: Schema.String,
 *       content: Schema.String
 *     }))
 *   })
 * })({ query: "Effect" })
 * const result = [WebSearch.name, WebSearch.providerName] // => ["OpenAiWebSearch", "web_search"]
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const providerDefined = <
  const Identifier extends `${string}.${string}`,
  const Name extends string,
  Args extends Schema.Constraint = typeof Schema.Void,
  Parameters extends Schema.Constraint = typeof Schema.Void,
  Success extends Schema.Constraint = typeof Schema.Void,
  Failure extends Schema.Constraint = typeof Schema.Never,
  RequiresHandler extends boolean = false
>(options: {
  /**
   * the identifier which is used to uniquely identify the provider-defined tool.
   */
  readonly id: Identifier
  /**
   * Custom name used by the Toolkit to identify this tool.
   */
  readonly customName: Name
  /**
   * Provider-specific name given to the tool by the large language model provider.
   */
  readonly providerName: string
  /**
   * Schema for user-provided configuration arguments.
   */
  readonly args?: Args | undefined
  /**
   * Whether this tool requires a custom handler implementation.
   */
  readonly requiresHandler?: RequiresHandler | undefined
  /**
   * Schema for parameters the provider sends when calling the tool.
   */
  readonly parameters?: Parameters | undefined
  /**
   * Schema for successful tool execution results.
   */
  readonly success?: Success | undefined
  /**
   * Schema for failed tool execution results.
   */
  readonly failure?: Failure | undefined
}) =>
<Mode extends FailureMode | undefined = undefined>(
  args: RequiresHandler extends true ? Struct.Simplify<
      Args["Encoded"] & {
        /**
         * The strategy used for handling errors returned from tool call handler
         * execution.
         *
         * If set to `"error"` (the default), errors that occur during tool call handler
         * execution will be returned in the error channel of the calling effect.
         *
         * If set to `"return"`, errors that occur during tool call handler execution
         * will be captured and returned as part of the tool call result.
         */
        readonly failureMode?: Mode | undefined
      }
    >
    : Struct.Simplify<Args["Encoded"]>
): ProviderDefined<
  Identifier,
  Name,
  {
    readonly args: Args
    readonly parameters: Parameters
    readonly success: Success
    readonly failure: Failure
    readonly failureMode: Mode extends undefined ? "error" : Mode
  },
  RequiresHandler
> => {
  const failureMode = Predicate.isNotUndefined(args) && "failureMode" in args
    ? (args as any).failureMode
    : undefined
  const successSchema = options?.success ?? Schema.Void
  const failureSchema = options?.failure ?? Schema.Never
  return providerDefinedProto({
    id: options.id,
    name: options.customName,
    providerName: options.providerName,
    args: args as any,
    argsSchema: (options?.args ?? Schema.Void) as any,
    requiresHandler: options.requiresHandler ?? false,
    parametersSchema: (options?.parameters ?? Schema.Void) as any,
    successSchema,
    failureSchema,
    failureMode: failureMode ?? "error"
  }) as any
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Maps between a provider-defined tool name and the name given to the tool by
 * the Effect AI SDK.
 *
 * **Details**
 *
 * The custom names used by the Effect AI SDK are to allow for toolkits which
 * contain tools from multiple different providers that would otherwise have
 * naming conflicts (i.e. `"web_search"`) to instead use custom names (i.e.
 * `"OpenAiWebSearch"`).
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export class NameMapper<Tools extends ReadonlyArray<Any>> {
  readonly #customToProvider: Map<string, string> = new Map()
  readonly #providerToCustom: Map<string, string> = new Map()

  constructor(tools: Tools) {
    for (const tool of tools) {
      if (isProviderDefined(tool)) {
        this.#customToProvider.set(tool.name, tool.providerName)
        this.#providerToCustom.set(tool.providerName, tool.name)
      }
    }
  }

  /**
   * Returns a list of the user-specified tool names in the name mapper.
   */
  get customNames(): ReadonlyArray<string> {
    return Array.from(this.#customToProvider.keys())
  }

  /**
   * Returns a list of the provider-specified tool names in the name mapper.
   */
  get providerNames(): ReadonlyArray<string> {
    return Array.from(this.#providerToCustom.keys())
  }

  /**
   * Returns the user-specified tool name that corresponds with the provided
   * provider-specified tool name.
   *
   * **Details**
   *
   * If the provider-specified tool name was not registered with the name mapper,
   * then the provider-specified tool name is returned.
   */
  getCustomName(providerName: string): string {
    return this.#providerToCustom.get(providerName) ?? providerName
  }

  /**
   * Returns the provider-specified tool name that corresponds with the provided
   * user-specified tool name.
   *
   * **Details**
   *
   * If the user-specified tool name was not registered with the name mapper,
   * then the user-specified tool name is returned.
   */
  getProviderName(customName: string): string {
    return this.#customToProvider.get(customName) ?? customName
  }
}

/**
 * Extracts the description from a tool's metadata.
 *
 * **Details**
 *
 * Returns the tool's description if explicitly set, otherwise attempts to
 * extract it from the parameter schema's AST annotations.
 *
 * **Example** (Reading a tool description)
 *
 * ```ts import.meta.vitest
 * import { Tool } from "effect/ai"
 *
 * const myTool = Tool.make("example", {
 *   description: "This is an example tool"
 * })
 *
 * const description = Tool.getDescription(myTool)
 * description // => "This is an example tool"
 * ```
 *
 * @stability unstable
 * @category getters
 * @since 4.0.0
 */
export const getDescription = <Tool extends Any>(tool: Tool): string | undefined => {
  if (tool.description !== undefined) {
    return tool.description
  }
  if (Schema.isSchema(tool.parametersSchema)) {
    return SchemaAST.resolveDescription(tool.parametersSchema.ast)
  }
  return undefined
}

/**
 * Generates a JSON Schema for a tool.
 *
 * **Details**
 *
 * This function creates a JSON Schema representation that can be used by
 * large language models to indicate the structure and type of the parameters
 * that a given tool call should receive.
 *
 * May accept an optional `CodecTransformer` which can be used to transform the
 * tool parameter schema so that the resultant JSON schema for the tool call
 * parameters are in a format that conforms to any provider-specific constraints.
 *
 * **Example** (Generating a tool JSON schema)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 * import { Tool } from "effect/ai"
 *
 * const weatherTool = Tool.make("get_weather", {
 *   parameters: Schema.Struct({
 *     location: Schema.String,
 *     units: Schema.Literals(["celsius", "fahrenheit"])
 *   })
 * })
 *
 * const jsonSchema = Tool.getJsonSchema(weatherTool)
 * jsonSchema.type // => "object"
 * if (typeof jsonSchema.properties === "object" && jsonSchema.properties !== null) {
 *   Object.keys(jsonSchema.properties) // => ["location", "units"]
 * }
 * ```
 *
 * @stability unstable
 * @category getters
 * @since 4.0.0
 */
export const getJsonSchema = <Tool extends Any>(tool: Tool, options?: {
  readonly transformer?: CodecTransformer
}): JsonSchema.JsonSchema => {
  if (isDynamic(tool) && tool.jsonSchema !== undefined) {
    return tool.jsonSchema
  }
  return getJsonSchemaFromSchema(tool.parametersSchema, options)
}

/**
 * Generates a JSON Schema from an Effect `Schema`.
 *
 * **Details**
 *
 * If a `CodecTransformer` is supplied, the transformed schema's JSON Schema is
 * returned. Otherwise, the schema is converted with
 * `Schema.toJsonSchemaDocument` and any generated definitions are attached as
 * `$defs`.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const getJsonSchemaFromSchema = <S extends Schema.Constraint>(schema: S, options?: {
  readonly transformer?: CodecTransformer
}): JsonSchema.JsonSchema => {
  return getJsonSchemaFromSchemaWith(schema, Schema.toJsonSchemaDocument, options)
}

const getJsonSchemaFromSchemaWith = <S extends Schema.Constraint>(
  schema: S,
  toJsonSchemaDocument: (schema: Schema.Constraint) => JsonSchema.Document<"draft-2020-12">,
  options?: { readonly transformer?: CodecTransformer }
): JsonSchema.JsonSchema => {
  if (Predicate.isNotUndefined(options?.transformer)) {
    return options.transformer(schema).jsonSchema
  }
  const document = toJsonSchemaDocument(schema)
  if (Object.keys(document.definitions).length > 0) {
    document.schema.$defs = document.definitions
  }
  return document.schema
}

// =============================================================================
// Annotations
// =============================================================================

/**
 * Annotation for providing a human-readable title for tools.
 *
 * **Example** (Annotating a tool title)
 *
 * ```ts import.meta.vitest
 * import { Context } from "effect"
 * import { Tool } from "effect/ai"
 *
 * const myTool = Tool.make("calculate_tip")
 *   .annotate(Tool.Title, "Tip Calculator")
 * Context.getUnsafe(myTool.annotations, Tool.Title) // => "Tip Calculator"
 * ```
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class Title extends Context.Service<Title, string>()("effect/ai/Tool/Title") {}

/**
 * Annotation for providing tool metadata for MCP.
 *
 * **Example** (Annotating MCP metadata)
 *
 * ```ts import.meta.vitest
 * import { Context } from "effect"
 * import { Tool } from "effect/ai"
 *
 * const myCalculatorUi = Tool.make("calculator_ui", {})
 *   .annotate(Tool.Meta, { ui: { resourceUri: "ui://example/calculator-ui" } })
 * "ui" in Context.getUnsafe(myCalculatorUi.annotations, Tool.Meta) // => true
 * ```
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class Meta extends Context.Service<Meta, Record<string, unknown>>()("effect/ai/Tool/Meta") {}

/**
 * Annotation indicating whether a tool only reads data without making changes.
 *
 * **Details**
 *
 * This is emitted as the MCP `readOnlyHint`; unannotated tools default to
 * `false`.
 *
 * **Example** (Marking a tool as read-only)
 *
 * ```ts import.meta.vitest
 * import { Context } from "effect"
 * import { Tool } from "effect/ai"
 *
 * const readOnlyTool = Tool.make("get_user_info")
 *   .annotate(Tool.Readonly, true)
 * Context.get(readOnlyTool.annotations, Tool.Readonly) // => true
 * ```
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const Readonly = Context.Reference<boolean>("effect/ai/Tool/Readonly", {
  defaultValue: constFalse
})

/**
 * Annotation indicating whether a tool may perform destructive operations.
 *
 * **Details**
 *
 * This is emitted as the MCP `destructiveHint`; unannotated tools default to
 * `true`, so annotate safe tools with `false`.
 *
 * **Example** (Marking a tool as non-destructive)
 *
 * ```ts import.meta.vitest
 * import { Context } from "effect"
 * import { Tool } from "effect/ai"
 *
 * const safeTool = Tool.make("search_database")
 *   .annotate(Tool.Destructive, false)
 * Context.get(safeTool.annotations, Tool.Destructive) // => false
 * ```
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const Destructive = Context.Reference<boolean>("effect/ai/Tool/Destructive", {
  defaultValue: constTrue
})

/**
 * Annotation indicating whether a tool can be called repeatedly with the same
 * parameters without changing the result beyond the first call.
 *
 * **Details**
 *
 * This is emitted as the MCP `idempotentHint`; unannotated tools default to
 * `false`.
 *
 * **Example** (Marking a tool as idempotent)
 *
 * ```ts import.meta.vitest
 * import { Context } from "effect"
 * import { Tool } from "effect/ai"
 *
 * const idempotentTool = Tool.make("get_current_time")
 *   .annotate(Tool.Idempotent, true)
 * Context.get(idempotentTool.annotations, Tool.Idempotent) // => true
 * ```
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const Idempotent = Context.Reference<boolean>("effect/ai/Tool/Idempotent", {
  defaultValue: constFalse
})

/**
 * Annotation indicating whether a tool may interact with arbitrary external
 * data or systems.
 *
 * **Details**
 *
 * This is emitted as the MCP `openWorldHint`; unannotated tools default to
 * `true`.
 *
 * **Example** (Disabling open-world access)
 *
 * ```ts import.meta.vitest
 * import { Context } from "effect"
 * import { Tool } from "effect/ai"
 *
 * const restrictedTool = Tool.make("internal_operation")
 *   .annotate(Tool.OpenWorld, false)
 * Context.get(restrictedTool.annotations, Tool.OpenWorld) // => false
 * ```
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const OpenWorld = Context.Reference<boolean>("effect/ai/Tool/OpenWorld", {
  defaultValue: constTrue
})

/**
 * Annotation controlling whether strict JSON schema mode is enabled for a tool.
 *
 * **Details**
 *
 * When `true`, providers that support strict mode will send `strict: true` to
 * the model API (e.g. OpenAI's Structured Outputs).
 *
 * When `false`, strict mode is disabled and `strict: false` is sent.
 *
 * When `undefined` (default), the provider's global configuration determines
 * the behavior (e.g. `Config.strictJsonSchema` for OpenAI).
 *
 * **Example** (Disabling strict JSON schema mode)
 *
 * ```ts import.meta.vitest
 * import { Tool } from "effect/ai"
 *
 * const flexibleTool = Tool.make("search")
 *   .annotate(Tool.Strict, false)
 * Tool.getStrictMode(flexibleTool) // => false
 * ```
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const Strict = Context.Reference<boolean | undefined>("effect/ai/Tool/Strict", {
  defaultValue: () => undefined
})

/**
 * Returns the strict mode setting for a tool, or `undefined` if not set.
 *
 * **When to use**
 *
 * Use to inspect the per-tool strict JSON Schema override attached through
 * `Tool.Strict`.
 *
 * **Gotchas**
 *
 * `undefined` means no per-tool override is set. It is distinct from `false`;
 * provider or global configuration determines the final behavior.
 *
 * @see {@link Strict} for the annotation read by this helper
 *
 * @stability unstable
 * @category getters
 * @since 4.0.0
 */
export const getStrictMode = <T extends Any>(tool: T): boolean | undefined => Context.get(tool.annotations, Strict)

// Licensed under BSD-3-Clause (below code only)
// Code adapted from https://github.com/fastify/secure-json-parse/blob/783fcb1b5434709466759847cec974381939673a/index.js
//
// Copyright (c) Effectful Technologies, Inc (https://effectful.co)
// Copyright (c) 2019 The Fastify Team
// Copyright (c) 2019, Sideway Inc, and project contributors
// All rights reserved.
//
// The complete list of contributors can be found at:
// - https://github.com/hapijs/bourne/graphs/contributors
// - https://github.com/fastify/secure-json-parse/graphs/contributors
// - https://github.com/Effect-TS/effect/commits/main/packages/ai/ai/src/Tool.ts
//
// Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
//
// 1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
//
// 2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
//
// 3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

const suspectProtoRx = /"__proto__"\s*:/
const suspectConstructorRx = /"constructor"\s*:/

function _parse(text: string) {
  // Parse normally
  const obj = JSON.parse(text)

  // Ignore null and non-objects
  if (obj === null || typeof obj !== "object") {
    return obj
  }

  if (
    suspectProtoRx.test(text) === false &&
    suspectConstructorRx.test(text) === false
  ) {
    return obj
  }

  // Scan result for proto keys
  return filter(obj)
}

function filter(obj: any) {
  let next = [obj]

  while (next.length) {
    const nodes = next
    next = []

    for (const node of nodes) {
      if (Object.hasOwn(node, "__proto__")) {
        throw new SyntaxError("Object contains forbidden prototype property")
      }

      if (
        Object.hasOwn(node, "constructor") &&
        Object.hasOwn(node.constructor, "prototype")
      ) {
        throw new SyntaxError("Object contains forbidden prototype property")
      }

      for (const key in node) {
        const value = node[key]
        if (value && typeof value === "object") {
          next.push(value)
        }
      }
    }
  }
  return obj
}

/**
 * Parses JSON text while rejecting prototype-pollution keys.
 *
 * **When to use**
 *
 * Use when you need a JSON parser that throws for invalid JSON or unsafe
 * object shapes.
 *
 * **Gotchas**
 *
 * Invalid JSON throws through `JSON.parse`. Parsed objects containing an own
 * `__proto__` property or a dangerous `constructor.prototype` shape throw a
 * `SyntaxError`.
 *
 * @stability unstable
 * @category unsafe
 * @since 4.0.0
 */
export const unsafeSecureJsonParse = (text: string): unknown => {
  // Performance optimization, see https://github.com/fastify/secure-json-parse/pull/90
  const prevLimit = StackTraceLimit.getStackTraceLimit()
  StackTraceLimit.setStackTraceLimit(0)
  try {
    return _parse(text)
  } finally {
    StackTraceLimit.setStackTraceLimit(prevLimit)
  }
}

/**
 * Schema for denied or interrupted tool calls.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ExecutionFailure = Schema.Struct({
  type: Schema.Literals(["execution-denied", "execution-interrupted"]),
  reason: Schema.String
}).annotate({ identifier: "ToolExecutionFailure" })

/**
 * Returns the failure schema shared by `Toolkit` and `Response`.
 *
 * **Details**
 *
 * `AiError` comes first to restore error instances. The user schema precedes
 * {@link ExecutionFailure} to preserve user fields.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const failureResultSchema = <T extends Any>(
  tool: T
): Schema.Union<readonly [typeof AiError.AiError, T["failureSchema"], typeof ExecutionFailure]> =>
  Schema.Union([AiError.AiError, tool.failureSchema, ExecutionFailure])

/**
 * Type of the `EmptyParams` schema used for tools with no parameters.
 *
 * **Details**
 *
 * It is a record schema with string keys and `never` values, so the generated
 * parameter schema accepts an empty object shape with no properties.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export interface EmptyParams extends Schema.$Record<Schema.String, Schema.Never> {}

/**
 * Schema for tools that accept no parameters.
 *
 * **When to use**
 *
 * Use when you need an explicit no-parameter `parameters` schema for a tool.
 *
 * **Details**
 *
 * This is `Schema.Record(Schema.String, Schema.Never)`, representing an empty
 * object parameter shape with no additional properties.
 *
 * @see {@link make} for the tool constructor that defaults omitted parameters to this schema
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const EmptyParams: EmptyParams = Schema.Record(Schema.String, Schema.Never)

/**
 * @internal
 */
export function isEmptyParamsRecord(indexSignature: SchemaAST.IndexSignature): boolean {
  return indexSignature.parameter === SchemaAST.string && SchemaAST.isNever(indexSignature.type)
}
