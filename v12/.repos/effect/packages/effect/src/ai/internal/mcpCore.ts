/**
 * Version-neutral MCP server records and semantic operations.
 *
 * @internal
 */

import * as Arr from "../../Array.ts"
import * as Cause from "../../Cause.ts"
import * as Data from "../../Data.ts"
import * as Effect from "../../Effect.ts"
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
      : CanonicalRequestMetadata | Readonly<Record<string, unknown>>)
    | undefined
}

// NOTE: Capabilities remain a normalized core model because dated revisions
// advertise different fields and encode capability presence differently.
/**
 * @internal
 */
export interface CanonicalServerCapabilities {
  readonly experimental?: Readonly<Record<string, Readonly<Record<string, unknown>>>> | undefined
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
  readonly extensions?: Readonly<Record<string, unknown>> | undefined
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
 * A request rejected outside the handler, for example by MCP middleware.
 * Adapters send it as a JSON-RPC error with its code, message and data, never
 * as a tool result. `error` keeps the original failure for in-process callers.
 *
 * @internal
 */
export class RequestRejected extends Data.TaggedError("RequestRejected")<{
  readonly code: number
  readonly message: string
  readonly data?: unknown
  readonly error: McpSchema.McpErrorBase
}> {}

/**
 * @internal
 */
export type ToolError =
  | ToolNotFound
  | InvalidToolInput
  | InvalidToolContinuation
  | ToolExecutionError
  | RequestRejected

/**
 * @internal
 */
export interface ToolRegistration {
  // The canonical Tool copy normalizes its top-level title from
  // `tool.title ?? tool.annotations?.title` at the public boundary.
  readonly descriptor: McpSchema.Tool
  readonly isVisible: (profile: NegotiatedProtocolProfile<string>) => boolean
  readonly visible?: Visible | undefined
  readonly handle: (
    call: typeof McpSchema.CallTool.payloadSchema.Type,
    invocation: McpInvocation
  ) => Effect.Effect<
    OperationOutcome<McpSchema.CallToolResult>,
    ToolNotFound | InvalidToolInput | InvalidToolContinuation | ToolExecutionError | RequestRejected,
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
    invocation: McpInvocation
  ) => Effect.Effect<ReadonlyArray<McpSchema.Tool>, RequestRejected>
  // Skips request-level visibility checks.
  readonly find: (
    name: string,
    profile: NegotiatedProtocolProfile<string>
  ) => McpSchema.Tool | undefined
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
  readonly visible?: Visible | undefined
  readonly read: (
    invocation: McpInvocation
  ) => Effect.Effect<McpSchema.ReadResourceResult, ResourceNotFound | McpSchema.InternalError | RequestRejected>
}

/**
 * @internal
 */
export interface ResourceTemplateRegistration {
  readonly descriptor: McpSchema.ResourceTemplate
  readonly isVisible: (profile: NegotiatedProtocolProfile<string>) => boolean
  readonly visible?: Visible | undefined
  readonly match: (uri: string) => ReadonlyArray<string> | undefined
  readonly read: (
    uri: string,
    params: ReadonlyArray<string>,
    invocation: McpInvocation
  ) => Effect.Effect<
    McpSchema.ReadResourceResult,
    ResourceNotFound | McpSchema.InvalidParams | McpSchema.InternalError | RequestRejected
  >
}

/**
 * @internal
 */
export interface Resources {
  // Synchronous, so a caller can check skill ownership and register in one step.
  readonly register: (registration: ResourceRegistration) => void
  readonly registerTemplate: (registration: ResourceTemplateRegistration) => Effect.Effect<void>
  readonly list: (
    invocation: McpInvocation
  ) => Effect.Effect<ReadonlyArray<McpSchema.Resource>, RequestRejected>
  readonly listTemplates: (
    invocation: McpInvocation
  ) => Effect.Effect<ReadonlyArray<McpSchema.ResourceTemplate>, RequestRejected>
  readonly read: (
    uri: string,
    invocation: McpInvocation
  ) => Effect.Effect<
    McpSchema.ReadResourceResult,
    ResourceNotFound | McpSchema.InvalidParams | McpSchema.InternalError | RequestRejected
  >
}

/**
 * A file of a skill, with the digest and size of the bytes it is served as.
 *
 * @internal
 */
export interface SkillResource {
  readonly uri: string
  readonly digest: string
  readonly size: number
}

/**
 * A `skills/list` and `skills/get` entry. `resources` is `"dynamic"` for a
 * skill whose content cannot carry stable digests.
 *
 * @internal
 */
export interface Skill {
  readonly uri: string
  readonly frontmatter: Readonly<Record<string, unknown>>
  readonly resources: ReadonlyArray<SkillResource> | "dynamic"
}

/**
 * A `resources/directory/read` child: a file, with the metadata
 * `resources/list` gives it, or a subdirectory with the `inode/directory` MIME
 * type.
 *
 * @internal
 */
export interface DirectoryChild {
  readonly uri: string
  readonly name: string
  readonly description?: string | undefined
  readonly mimeType: string
  readonly size?: number | undefined
}

/**
 * @internal
 */
export class SkillNotFound extends Data.TaggedError("SkillNotFound")<{
  readonly uri: string
}> {}

/**
 * @internal
 */
export class DirectoryNotFound extends Data.TaggedError("DirectoryNotFound")<{
  readonly uri: string
}> {}

/**
 * @internal
 */
export interface SkillRegistration {
  readonly entry: Skill
  readonly isVisible: (profile: NegotiatedProtocolProfile<string>) => boolean
  readonly visible?: Visible | undefined
  // Hides the skill's directories on `resources/directory/read`.
  readonly visibleInDirectories?: Visible | undefined
  readonly get: (invocation: McpInvocation) => Effect.Effect<Skill, SkillNotFound | RequestRejected>
  // `undefined` when this skill has no directory at `uri`. Directories shared
  // by several skills, such as a common path prefix, list the union of what
  // each skill returns.
  readonly directory: (uri: string) => ReadonlyArray<DirectoryChild> | undefined
}

/**
 * @internal
 */
export interface Skills {
  // Fails when the skill's directory overlaps another skill's, or one of its
  // files is already registered as a resource.
  readonly register: (registration: SkillRegistration) => Effect.Effect<void, Cause.IllegalArgumentError>
  // Whether `uri` is a file of a registered skill, which only that skill may serve.
  readonly ownsFile: (uri: string) => boolean
  readonly list: (invocation: McpInvocation) => Effect.Effect<ReadonlyArray<Skill>, RequestRejected>
  readonly get: (uri: string, invocation: McpInvocation) => Effect.Effect<Skill, SkillNotFound | RequestRejected>
  readonly readDirectory: (
    uri: string,
    invocation: McpInvocation
  ) => Effect.Effect<ReadonlyArray<DirectoryChild>, DirectoryNotFound | RequestRejected>
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
  readonly visible?: Visible | undefined
  readonly get: (
    args: Readonly<Record<string, string>>,
    invocation: McpInvocation
  ) => Effect.Effect<
    OperationOutcome<McpSchema.GetPromptResult>,
    PromptNotFound | McpSchema.InvalidParams | McpSchema.InternalError | RequestRejected
  >
}

/**
 * @internal
 */
export interface Prompts {
  readonly register: (registration: PromptRegistration) => Effect.Effect<void>
  readonly list: (
    invocation: McpInvocation
  ) => Effect.Effect<ReadonlyArray<McpSchema.Prompt>, RequestRejected>
  readonly get: (
    name: string,
    args: Readonly<Record<string, string>>,
    invocation: McpInvocation
  ) => Effect.Effect<
    OperationOutcome<McpSchema.GetPromptResult>,
    PromptNotFound | McpSchema.InvalidParams | McpSchema.InternalError | RequestRejected
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
  readonly metadata?: Readonly<Record<string, unknown>> | undefined
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
    ) => Effect.Effect<CompletionResult, McpSchema.InvalidParams | McpSchema.InternalError | RequestRejected>
  ) => Effect.Effect<void>
  readonly complete: (
    request: CompletionRequest,
    invocation: McpInvocation
  ) => Effect.Effect<CompletionResult, McpSchema.InvalidParams | McpSchema.InternalError | RequestRejected>
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
    readonly metadata?: Readonly<Record<string, unknown>> | undefined
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
  readonly metadata?: Readonly<Record<string, unknown>> | undefined
}

/**
 * @internal
 */
export type ServerNotification = Data.TaggedEnum<{
  Cancelled: {
    readonly requestId: string | number
    readonly reason?: string | undefined
    readonly metadata?: Readonly<Record<string, unknown>> | undefined
  }
  Progress: {
    readonly progressToken: string | number
    readonly progress: number
    readonly total?: number | undefined
    readonly message?: string | undefined
    readonly metadata?: Readonly<Record<string, unknown>> | undefined
  }
  LoggingMessage: {
    readonly level: McpSchema.LoggingLevel
    readonly logger?: string | undefined
    readonly data: unknown
    readonly metadata?: Readonly<Record<string, unknown>> | undefined
  }
  ResourceUpdated: { readonly uri: string; readonly metadata?: Readonly<Record<string, unknown>> | undefined }
  ResourcesChanged: { readonly metadata?: Readonly<Record<string, unknown>> | undefined }
  ToolsChanged: { readonly metadata?: Readonly<Record<string, unknown>> | undefined }
  PromptsChanged: { readonly metadata?: Readonly<Record<string, unknown>> | undefined }
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
  readonly skills: Skills
  readonly registrationPresence: Effect.Effect<{
    readonly tools: boolean
    readonly resources: boolean
    readonly prompts: boolean
    readonly skills: boolean
  }>
}

/**
 * Runs the request-level visibility checks of a registration on a list
 * request, after `isVisible` passed.
 *
 * @internal
 */
export type Visible = (invocation: McpInvocation) => Effect.Effect<boolean, RequestRejected>

// Whether one skill directory contains the other, or both are the same.
const skillsOverlap = (a: string, b: string): boolean => {
  const rootA = a.slice(0, -"/SKILL.md".length)
  const rootB = b.slice(0, -"/SKILL.md".length)
  return rootA === rootB || rootA.startsWith(`${rootB}/`) || rootB.startsWith(`${rootA}/`)
}

/**
 * @internal
 */
export const make: Effect.Effect<McpCore> = Effect.sync(() => {
  const registrations = new Map<string, ToolRegistration>()
  const resourceRegistrations: Array<ResourceRegistration> = []
  const resourceTemplateRegistrations: Array<ResourceTemplateRegistration> = []
  const promptRegistrations = new Map<string, PromptRegistration>()
  const skillRegistrations = new Map<string, SkillRegistration>()
  const skillFiles = new Set<string>()
  const completionRegistrations = new Map<
    string,
    (
      request: CompletionRequest,
      invocation: McpInvocation
    ) => Effect.Effect<CompletionResult, McpSchema.InvalidParams | McpSchema.InternalError | RequestRejected>
  >()

  const filterList = <D>(
    registrations: Iterable<{
      readonly descriptor: D
      readonly isVisible: ToolRegistration["isVisible"]
      readonly visible?: Visible | undefined
    }>,
    invocation: McpInvocation
  ): Effect.Effect<ReadonlyArray<D>, RequestRejected> =>
    Effect.map(
      Effect.filter(
        Arr.filter(registrations, (entry) => entry.isVisible(invocation.protocol)),
        (entry) => entry.visible === undefined ? Effect.succeed(true) : entry.visible(invocation)
      ),
      (entries) => entries.map((entry) => entry.descriptor)
    )

  const tools: Tools = {
    register: (registration) =>
      Effect.sync(() => {
        registrations.set(registration.descriptor.name, registration)
      }),
    list: (invocation) => filterList(registrations.values(), invocation),
    find: (name, profile) => {
      const registration = registrations.get(name)
      return registration !== undefined && registration.isVisible(profile) ? registration.descriptor : undefined
    },
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
    register: (registration) => {
      const index = resourceRegistrations.findIndex((entry) => entry.descriptor.uri === registration.descriptor.uri)
      if (index === -1) {
        resourceRegistrations.push(registration)
      } else {
        resourceRegistrations[index] = registration
      }
    },
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
    list: (invocation) => filterList(resourceRegistrations, invocation),
    listTemplates: (invocation) => filterList(resourceTemplateRegistrations, invocation),
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
    list: (invocation) => filterList(promptRegistrations.values(), invocation),
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

  const skills: Skills = {
    register: (registration) =>
      Effect.suspend(() => {
        const { uri, resources } = registration.entry
        const fail = (reason: string) => Effect.fail(new Cause.IllegalArgumentError(`Skill ${uri}: ${reason}`))
        for (const other of skillRegistrations.keys()) {
          if (skillsOverlap(uri, other)) return fail(`its directory overlaps the skill ${other}`)
        }
        const files = resources === "dynamic" ? [] : resources.map((resource) => resource.uri)
        for (const file of files) {
          if (resourceRegistrations.some((entry) => entry.descriptor.uri === file)) {
            return fail(`${file} is already registered as a resource`)
          }
        }
        skillRegistrations.set(uri, registration)
        for (const file of files) skillFiles.add(file)
        return Effect.void
      }),
    ownsFile: (uri) => skillFiles.has(uri),
    list: (invocation) =>
      filterList(
        Array.from(skillRegistrations.values(), (registration) => ({
          descriptor: registration.entry,
          isVisible: registration.isVisible,
          visible: registration.visible
        })),
        invocation
      ),
    get: (uri, invocation) =>
      Effect.suspend(() => {
        const registration = skillRegistrations.get(uri)
        return registration !== undefined && registration.isVisible(invocation.protocol)
          ? registration.get(invocation)
          : Effect.fail(new SkillNotFound({ uri }))
      }),
    readDirectory: Effect.fnUntraced(function*(uri, invocation) {
      const children = new Map<string, DirectoryChild>()
      let found = false
      for (const registration of skillRegistrations.values()) {
        const own = registration.directory(uri)
        if (own === undefined || !registration.isVisible(invocation.protocol)) continue
        if (
          registration.visibleInDirectories !== undefined &&
          !(yield* registration.visibleInDirectories(invocation))
        ) continue
        found = true
        for (const child of own) children.set(child.uri, child)
      }
      if (!found) {
        return yield* new DirectoryNotFound({ uri })
      }
      return Array.from(children.values()).sort((a, b) => a.uri < b.uri ? -1 : a.uri > b.uri ? 1 : 0)
    })
  }

  const registrationPresence = Effect.sync(() => ({
    tools: registrations.size > 0,
    resources: resourceRegistrations.length > 0 || resourceTemplateRegistrations.length > 0,
    prompts: promptRegistrations.size > 0,
    skills: skillRegistrations.size > 0
  }))

  return { tools, resources, prompts, completions, skills, registrationPresence }
})
