/**
 * Version-neutral MCP server records and semantic operations.
 *
 * @internal
 */

import * as Arr from "../../Array.ts"
import * as Data from "../../Data.ts"
import * as Effect from "../../Effect.ts"
import type * as Schema from "../../Schema.ts"
import type * as McpProtocol from "../McpProtocol.ts"
import * as McpSchema from "../McpSchema.ts"

/**
 * @internal
 */
export interface InputRequiredFields {
  readonly inputRequests?: Readonly<Record<string, McpSchema.McpInputRequest>> | undefined
  readonly requestState?: string | undefined
}

/**
 * @internal
 */
export type OperationOutcome<A> = Data.TaggedEnum<{
  Complete: { readonly value: A }
  InputRequired: InputRequiredFields
}>

/**
 * @internal
 */
export const OperationOutcome = {
  Complete: <A>(value: A): OperationOutcome<A> => ({ _tag: "Complete", value }),
  InputRequired: (fields: InputRequiredFields): OperationOutcome<never> => ({
    _tag: "InputRequired",
    ...fields
  })
}

/**
 * @internal
 */
export type CanonicalRequestMetadata = NonNullable<
  typeof McpSchema.Initialize.payloadSchema.Type["_meta"]
>

/**
 * @internal
 */
export interface NegotiatedProtocolProfile<out Version extends string = McpProtocol.StatefulProtocolVersion> {
  // Core decisions receive negotiated facts rather than dated wire requests.
  readonly protocolVersion: Version
  readonly clientCapabilities: McpSchema.ClientCapabilities
  readonly clientInfo: Version extends McpProtocol.StatefulProtocolVersion ? McpSchema.Implementation
    : McpSchema.Implementation | undefined
  readonly requestMetadata?:
    | (Version extends McpProtocol.StatefulProtocolVersion ? CanonicalRequestMetadata
      : CanonicalRequestMetadata | Schema.JsonObject)
    | undefined
}

// NOTE: Capabilities remain a normalized core model because dated revisions
// advertise different fields and encode capability presence differently.
/**
 * @internal
 */
export interface CanonicalServerCapabilities {
  readonly experimental?: Readonly<Record<string, Schema.JsonObject>> | undefined
  readonly logging?: boolean | undefined
  readonly completions?: boolean | undefined
  readonly prompts?: Readonly<{ readonly listChanged?: boolean | undefined }> | undefined
  readonly resources?:
    | Readonly<{
      readonly subscribe?: boolean | undefined
      readonly listChanged?: boolean | undefined
    }>
    | undefined
  readonly tools?: Readonly<{ readonly listChanged?: boolean | undefined }> | undefined
  readonly extensions?: Schema.JsonObject | undefined
}

/**
 * @internal
 */
export interface CanonicalInitializeResult {
  readonly capabilities: CanonicalServerCapabilities
  readonly serverInfo: McpSchema.Implementation
  readonly instructions?: string | undefined
}

/**
 * @internal
 */
export interface McpInvocation {
  readonly clientId: number
  readonly protocol: NegotiatedProtocolProfile<string>
  readonly requestContext: McpSchema.McpRequestContext["Service"]
  readonly serverClient?: McpSchema.McpServerClient["Service"] | undefined
}

// NOTE: McpInvocation is runtime context, not a wire DTO. It combines the
// negotiated profile with the request-scoped service used by handlers.

/**
 * @internal
 */
export class ResourceNotFound extends Data.TaggedError("ResourceNotFound")<{
  readonly uri: string
}> {}

// NOTE: Core errors preserve semantic failure categories before adapters map
// them to dated MCP error codes and messages.
/**
 * @internal
 */
export class ToolNotFound extends Data.TaggedError("ToolNotFound")<{
  readonly name: string
}> {}

/**
 * @internal
 */
export class InvalidToolInput extends Data.TaggedError("InvalidToolInput")<{
  readonly name: string
  readonly message: string
}> {}

/**
 * @internal
 */
export class InvalidToolContinuation extends Data.TaggedError("InvalidToolContinuation")<{
  readonly name: string
  readonly message: string
}> {}

/**
 * @internal
 */
export class ToolExecutionError extends Data.TaggedError("ToolExecutionError")<{
  readonly name: string
  readonly message: string
}> {}

/**
 * @internal
 */
export class UnsupportedByProtocol extends Data.TaggedError("UnsupportedByProtocol")<{
  readonly protocolVersion: McpProtocol.ProtocolVersion
  readonly feature: string
}> {}

/**
 * @internal
 */
export type ToolError =
  | ToolNotFound
  | InvalidToolInput
  | InvalidToolContinuation
  | ToolExecutionError

/**
 * @internal
 */
export interface ToolRegistration {
  // The canonical Tool copy normalizes its top-level title from
  // `tool.title ?? tool.annotations?.title` at the public boundary.
  readonly descriptor: McpSchema.Tool
  readonly isVisible: (profile: NegotiatedProtocolProfile<string>) => boolean
  readonly handle: (
    call: typeof McpSchema.CallTool.payloadSchema.Type,
    invocation: McpInvocation
  ) => Effect.Effect<
    OperationOutcome<McpSchema.CallToolResult>,
    InvalidToolInput | InvalidToolContinuation | ToolExecutionError,
    never
  >
}

/**
 * @internal
 */
export interface Tools {
  readonly register: (
    registration: ToolRegistration
  ) => Effect.Effect<void>
  readonly list: (
    profile: NegotiatedProtocolProfile<string>
  ) => Effect.Effect<ReadonlyArray<McpSchema.Tool>>
  readonly call: (
    call: typeof McpSchema.CallTool.payloadSchema.Type,
    invocation: McpInvocation
  ) => Effect.Effect<OperationOutcome<McpSchema.CallToolResult>, ToolError>
}

/**
 * @internal
 */
export interface ResourceRegistration {
  readonly descriptor: McpSchema.Resource
  readonly isVisible: (profile: NegotiatedProtocolProfile<string>) => boolean
  readonly read: (
    invocation: McpInvocation
  ) => Effect.Effect<McpSchema.ReadResourceResult, McpSchema.InternalError>
}

/**
 * @internal
 */
export interface ResourceTemplateRegistration {
  readonly descriptor: McpSchema.ResourceTemplate
  readonly isVisible: (profile: NegotiatedProtocolProfile<string>) => boolean
  readonly match: (uri: string) => ReadonlyArray<string> | undefined
  readonly read: (
    uri: string,
    params: ReadonlyArray<string>,
    invocation: McpInvocation
  ) => Effect.Effect<McpSchema.ReadResourceResult, McpSchema.InvalidParams | McpSchema.InternalError>
}

/**
 * @internal
 */
export interface Resources {
  readonly register: (registration: ResourceRegistration) => Effect.Effect<void>
  readonly registerTemplate: (registration: ResourceTemplateRegistration) => Effect.Effect<void>
  readonly list: (
    profile: NegotiatedProtocolProfile<string>
  ) => Effect.Effect<ReadonlyArray<McpSchema.Resource>>
  readonly listTemplates: (
    profile: NegotiatedProtocolProfile<string>
  ) => Effect.Effect<ReadonlyArray<McpSchema.ResourceTemplate>>
  readonly read: (
    uri: string,
    invocation: McpInvocation
  ) => Effect.Effect<
    McpSchema.ReadResourceResult,
    ResourceNotFound | McpSchema.InvalidParams | McpSchema.InternalError
  >
}

/**
 * @internal
 */
export class PromptNotFound extends Data.TaggedError("PromptNotFound")<{
  readonly name: string
}> {}

/**
 * @internal
 */
export interface PromptRegistration {
  readonly descriptor: McpSchema.Prompt
  readonly isVisible: (profile: NegotiatedProtocolProfile<string>) => boolean
  readonly get: (
    args: Readonly<Record<string, string>>,
    invocation: McpInvocation
  ) => Effect.Effect<OperationOutcome<McpSchema.GetPromptResult>, McpSchema.InvalidParams | McpSchema.InternalError>
}

/**
 * @internal
 */
export interface Prompts {
  readonly register: (registration: PromptRegistration) => Effect.Effect<void>
  readonly list: (
    profile: NegotiatedProtocolProfile<string>
  ) => Effect.Effect<ReadonlyArray<McpSchema.Prompt>>
  readonly get: (
    name: string,
    args: Readonly<Record<string, string>>,
    invocation: McpInvocation
  ) => Effect.Effect<
    OperationOutcome<McpSchema.GetPromptResult>,
    PromptNotFound | McpSchema.InvalidParams | McpSchema.InternalError
  >
}

/**
 * @internal
 */
export type CompletionReference =
  | { readonly type: "prompt"; readonly name: string; readonly title?: string | undefined }
  | { readonly type: "resourceTemplate"; readonly uriTemplate: string }

// NOTE: Completion requests/results normalize dated reference tags, optional
// context, and nested CompleteResult values.

/**
 * @internal
 */
export interface CompletionRequest {
  readonly reference: CompletionReference
  readonly argument: Readonly<{ readonly name: string; readonly value: string }>
  readonly context?: Readonly<{ readonly arguments?: Readonly<Record<string, string>> }> | undefined
  readonly metadata?: CanonicalRequestMetadata | undefined
}

/**
 * @internal
 */
export interface CompletionResult {
  readonly values: ReadonlyArray<string>
  readonly total?: number | undefined
  readonly hasMore?: boolean | undefined
  readonly metadata?: Schema.JsonObject | undefined
}

/**
 * @internal
 */
export interface Completions {
  readonly register: (
    key: string,
    complete: (
      request: CompletionRequest,
      invocation: McpInvocation
    ) => Effect.Effect<CompletionResult, McpSchema.InvalidParams | McpSchema.InternalError>
  ) => Effect.Effect<void>
  readonly complete: (
    request: CompletionRequest,
    invocation: McpInvocation
  ) => Effect.Effect<CompletionResult, McpSchema.InvalidParams | McpSchema.InternalError>
}

/**
 * @internal
 */
export type ClientNotification = Data.TaggedEnum<{
  Initialized: {}
  Progress: {
    readonly progressToken: string | number
    readonly progress: number
    readonly total?: number | undefined
    readonly message?: string | undefined
    readonly metadata?: Schema.JsonObject | undefined
  }
  RootsChanged: {}
}>

/**
 * @internal
 */
export const ClientNotification = Data.taggedEnum<ClientNotification>()

/**
 * @internal
 */
export interface Cancellation {
  readonly requestId: string | number
  readonly reason?: string | undefined
  readonly metadata?: Schema.JsonObject | undefined
}

/**
 * @internal
 */
export type ServerNotification = Data.TaggedEnum<{
  Cancelled: {
    readonly requestId: string | number
    readonly reason?: string | undefined
    readonly metadata?: Schema.JsonObject | undefined
  }
  Progress: {
    readonly progressToken: string | number
    readonly progress: number
    readonly total?: number | undefined
    readonly message?: string | undefined
    readonly metadata?: Schema.JsonObject | undefined
  }
  LoggingMessage: {
    readonly level: McpSchema.LoggingLevel
    readonly logger?: string | undefined
    readonly data: unknown
    readonly metadata?: Schema.JsonObject | undefined
  }
  ResourceUpdated: { readonly uri: string; readonly metadata?: Schema.JsonObject | undefined }
  ResourcesChanged: { readonly metadata?: Schema.JsonObject | undefined }
  ToolsChanged: { readonly metadata?: Schema.JsonObject | undefined }
  PromptsChanged: { readonly metadata?: Schema.JsonObject | undefined }
  ElicitationComplete: { readonly elicitationId: string }
}>

/**
 * @internal
 */
export const ServerNotification = Data.taggedEnum<ServerNotification>()

/**
 * @internal
 */
export interface McpCore {
  readonly tools: Tools
  readonly resources: Resources
  readonly prompts: Prompts
  readonly completions: Completions
  readonly registrationPresence: Effect.Effect<{
    readonly tools: boolean
    readonly resources: boolean
    readonly prompts: boolean
  }>
}

/**
 * @internal
 */
export const make: Effect.Effect<McpCore> = Effect.sync(() => {
  const registrations = new Map<string, ToolRegistration>()
  const resourceRegistrations: Array<ResourceRegistration> = []
  const resourceTemplateRegistrations: Array<ResourceTemplateRegistration> = []
  const promptRegistrations = new Map<string, PromptRegistration>()
  const completionRegistrations = new Map<
    string,
    (
      request: CompletionRequest,
      invocation: McpInvocation
    ) => Effect.Effect<CompletionResult, McpSchema.InvalidParams | McpSchema.InternalError>
  >()

  const tools: Tools = {
    register: (registration) =>
      Effect.sync(() => {
        registrations.set(registration.descriptor.name, registration)
      }),
    list: (profile) =>
      Effect.sync(() => {
        const descriptors: Array<McpSchema.Tool> = []
        for (const registration of registrations.values()) {
          if (registration.isVisible(profile)) {
            descriptors.push(registration.descriptor)
          }
        }
        return descriptors
      }),
    call: (call, invocation) =>
      Effect.suspend((): Effect.Effect<OperationOutcome<McpSchema.CallToolResult>, ToolError> => {
        const registration = registrations.get(call.name)
        if (registration === undefined) {
          return new ToolNotFound({ name: call.name })
        }
        if (!registration.isVisible(invocation.protocol)) {
          return new ToolNotFound({ name: call.name })
        }
        return registration.handle(call, invocation)
      })
  }

  const resources: Resources = {
    register: (registration) =>
      Effect.sync(() => {
        const index = resourceRegistrations.findIndex((entry) => entry.descriptor.uri === registration.descriptor.uri)
        if (index === -1) {
          resourceRegistrations.push(registration)
        } else {
          resourceRegistrations[index] = registration
        }
      }),
    registerTemplate: (registration) =>
      Effect.sync(() => {
        const index = resourceTemplateRegistrations.findIndex(
          (entry) => entry.descriptor.uriTemplate === registration.descriptor.uriTemplate
        )
        if (index === -1) {
          resourceTemplateRegistrations.push(registration)
        } else {
          resourceTemplateRegistrations[index] = registration
        }
      }),
    list: (profile) =>
      Effect.sync(() =>
        resourceRegistrations
          .filter((entry) => entry.isVisible(profile))
          .map((entry) => entry.descriptor)
      ),
    listTemplates: (profile) =>
      Effect.sync(() =>
        resourceTemplateRegistrations
          .filter((entry) => entry.isVisible(profile))
          .map((entry) => entry.descriptor)
      ),
    read: Effect.fnUntraced(function*(uri, invocation) {
      const resource = resourceRegistrations.find((entry) => entry.descriptor.uri === uri)
      if (resource !== undefined && resource.isVisible(invocation.protocol)) {
        return yield* resource.read(invocation)
      }
      for (const template of resourceTemplateRegistrations) {
        const params = template.match(uri)
        if (params !== undefined && template.isVisible(invocation.protocol)) {
          return yield* template.read(uri, params, invocation)
        }
      }
      return yield* new ResourceNotFound({ uri })
    })
  }

  const prompts: Prompts = {
    register: (registration) =>
      Effect.sync(() => {
        promptRegistrations.set(registration.descriptor.name, registration)
      }),
    list: (profile) =>
      Effect.sync(() =>
        Array.from(promptRegistrations.values())
          .filter((entry) => entry.isVisible(profile))
          .map((entry) => entry.descriptor)
      ),
    get: Effect.fnUntraced(function*(name, args, invocation) {
      const registration = promptRegistrations.get(name)
      if (registration === undefined || !registration.isVisible(invocation.protocol)) {
        return yield* new PromptNotFound({ name })
      }
      return yield* registration.get(args, invocation)
    })
  }

  const completions: Completions = {
    register: (key, complete) =>
      Effect.sync(() => {
        completionRegistrations.set(key, complete)
      }),
    complete: Effect.fnUntraced(function*(request, invocation) {
      const key = request.reference.type === "prompt"
        ? `prompt/${request.reference.name}/${request.argument.name}`
        : `resource/${request.reference.uriTemplate}/${request.argument.name}`
      const complete = completionRegistrations.get(key)
      if (complete === undefined) {
        return yield* new McpSchema.InvalidParams({ message: "Unknown completion reference or argument" })
      }
      const result = yield* complete(request, invocation)
      const values = Arr.take(result.values, 100)
      return {
        ...result,
        values,
        hasMore: result.hasMore === true || values.length < result.values.length
      }
    })
  }

  const registrationPresence = Effect.sync(() => ({
    tools: registrations.size > 0,
    resources: resourceRegistrations.length > 0 || resourceTemplateRegistrations.length > 0,
    prompts: promptRegistrations.size > 0
  }))

  return { tools, resources, prompts, completions, registrationPresence }
})
