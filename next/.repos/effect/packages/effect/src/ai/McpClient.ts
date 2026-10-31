/**
 * Connects to MCP servers with scoped Effect clients.
 *
 * Clients discover tools, prompts, resources and Agent Skills using the protocol revision
 * selected by their transport. `callTool` returns tool-reported errors as results; supplying a schema
 * turns them into a `ToolError` reason that retains the original result. Transport and
 * protocol failures fail the Effect. Interactive server requests, subscriptions, OAuth
 * and retries are not included.
 *
 * @stability experimental
 * @since 4.0.6
 */
import * as ByteSize from "../ByteSize.ts"
import type * as Cause from "../Cause.ts"
import * as Context from "../Context.ts"
import * as Digest from "../crypto/Digest.ts"
import * as Deferred from "../Deferred.ts"
import * as Duration from "../Duration.ts"
import * as Effect from "../Effect.ts"
import * as Base64 from "../encoding/Base64.ts"
import * as Sse from "../encoding/Sse.ts"
import * as Equal from "../Equal.ts"
import * as HttpClient from "../http/HttpClient.ts"
import * as HttpClientRequest from "../http/HttpClientRequest.ts"
import type * as HttpClientResponse from "../http/HttpClientResponse.ts"
import * as Layer from "../Layer.ts"
import * as Option from "../Option.ts"
import * as Predicate from "../Predicate.ts"
import type * as ChildProcess from "../process/ChildProcess.ts"
import { ChildProcessSpawner } from "../process/ChildProcessSpawner.ts"
import * as Queue from "../Queue.ts"
import type * as Rpc from "../rpc/Rpc.ts"
import * as Schema from "../Schema.ts"
import type * as Scope from "../Scope.ts"
import * as Stream from "../Stream.ts"
import { BASE64_SENTINEL_PREFIX, BASE64_SENTINEL_SUFFIX } from "./internal/mcpProtocol.ts"
import * as McpSkills from "./internal/mcpSkills.ts"
import {
  ClosedError,
  ConfigurationError,
  HttpError,
  isMcpClientError,
  LimitError,
  McpClientError,
  type McpClientErrorReason,
  ProtocolError,
  TimeoutError,
  ToolError,
  TransportError,
  UnsupportedError,
  ValidationError
} from "./McpClientError.ts"
import type * as McpProtocol from "./McpProtocol.ts"
import * as McpSchema from "./McpSchema.ts"
import * as Prompt from "./Prompt.ts"
import * as Tool from "./Tool.ts"
import * as Toolkit from "./Toolkit.ts"

// =============================================================================
// Models
// =============================================================================

/**
 * Supported MCP wire protocol revisions.
 *
 * @stability experimental
 * @category models
 * @since 4.0.6
 */
export type ProtocolVersion = "2025-11-25" | "2026-07-28"

/**
 * Service tag for applications that provide one default MCP connection.
 *
 * @stability experimental
 * @category services
 * @since 4.0.6
 */
export const McpClient: Context.Service<McpClient, McpClient> = Context.Service<McpClient>("effect/ai/McpClient")

/**
 * A scoped connection to one MCP server.
 *
 * @stability experimental
 * @category models
 * @since 4.0.6
 */
export interface McpClient {
  readonly [TypeId]: typeof TypeId
  readonly protocolVersion: ProtocolVersion
  /** Features advertised by the remote server. */
  readonly capabilities: McpSchema.ServerCapabilities
  readonly serverInfo: McpSchema.Implementation | undefined
  readonly instructions?: string | undefined
  /**
   * Returns every tool page as one snapshot within the client's discovery bounds.
   * `timeout` and `limits` (nonnegative integers) override those bounds, and each
   * page stays within the transport's message size limit.
   */
  readonly listTools: (
    options?: {
      readonly timeout?: Duration.Input | undefined
      readonly limits?: {
        readonly maxPages?: number | undefined
        readonly maxItems?: number | undefined
      } | undefined
    }
  ) => Effect.Effect<ReadonlyArray<McpSchema.Tool>, McpClientError>
  /** Returns every prompt page as one snapshot with the same bounds as `listTools`. */
  readonly listPrompts: (
    options?: {
      readonly timeout?: Duration.Input | undefined
      readonly limits?: {
        readonly maxPages?: number | undefined
        readonly maxItems?: number | undefined
      } | undefined
    }
  ) => Effect.Effect<ReadonlyArray<McpSchema.Prompt>, McpClientError>
  /** Gets the messages for a discovered prompt. Unbounded unless `timeout` is supplied. */
  readonly getPrompt: (
    params: {
      readonly prompt: McpSchema.Prompt
      readonly arguments?: typeof McpSchema.GetPrompt.payloadSchema.Type["arguments"]
    },
    options?: { readonly timeout?: Duration.Input | undefined }
  ) => Effect.Effect<McpSchema.GetPromptResult, McpClientError>
  /** Returns every resource page as one snapshot with the same bounds as `listTools`. */
  readonly listResources: (
    options?: {
      readonly timeout?: Duration.Input | undefined
      readonly limits?: {
        readonly maxPages?: number | undefined
        readonly maxItems?: number | undefined
      } | undefined
    }
  ) => Effect.Effect<ReadonlyArray<McpSchema.Resource>, McpClientError>
  /** Reads the complete contents of a resource URI. Unbounded unless `timeout` is supplied. */
  readonly readResource: (
    params: { readonly uri: string },
    options?: { readonly timeout?: Duration.Input | undefined }
  ) => Effect.Effect<McpSchema.ReadResourceResult, McpClientError>
  /**
   * Returns every skill page as one snapshot with the same bounds as `listTools`, or none
   * when the server does not declare the Skills extension. Fails on an invalid entry, unless
   * `onInvalidSkill` is supplied: invalid entries are then left out and each is passed to it.
   * Requires `extensions: { skills: true }`, as do the other skill methods.
   */
  readonly listSkills: (
    options?: {
      readonly timeout?: Duration.Input | undefined
      readonly limits?: {
        readonly maxPages?: number | undefined
        readonly maxItems?: number | undefined
      } | undefined
      readonly onInvalidSkill?:
        | ((invalid: { readonly entry: unknown; readonly error: McpClientError }) => Effect.Effect<void>)
        | undefined
    }
  ) => Effect.Effect<ReadonlyArray<McpSchema.Skill>, McpClientError>
  /**
   * Gets a skill by the URI of its `SKILL.md`, whether or not `listSkills` returns it.
   * Unbounded unless `timeout` is supplied.
   */
  readonly getSkill: (
    params: { readonly uri: string },
    options?: { readonly timeout?: Duration.Input | undefined }
  ) => Effect.Effect<McpSchema.Skill, McpClientError>
  /**
   * Lists the direct children of a directory in a skill namespace, with the same bounds as
   * `listTools`. Requires the server's `directoryRead` setting.
   */
  readonly readResourceDirectory: (
    params: { readonly uri: string },
    options?: {
      readonly timeout?: Duration.Input | undefined
      readonly limits?: {
        readonly maxPages?: number | undefined
        readonly maxItems?: number | undefined
      } | undefined
    }
  ) => Effect.Effect<ReadonlyArray<McpSchema.Resource>, McpClientError>
  /**
   * Reads a file of a skill and fails with a `ValidationError` unless its bytes match the
   * SHA-256 digest and size listed in the skill's manifest, and, for `SKILL.md`, unless its
   * YAML frontmatter equals the listed frontmatter. A skill whose `resources` is `"dynamic"`
   * has no digests: any file inside its directory can be read, and `SKILL.md` is still
   * checked. Files outside the manifest or directory are never requested. Unbounded unless
   * `timeout` is supplied.
   */
  readonly readSkillResource: (
    params: { readonly skill: McpSchema.Skill; readonly uri: string },
    options?: { readonly timeout?: Duration.Input | undefined }
  ) => Effect.Effect<McpSchema.ReadResourceResult, McpClientError>
  /**
   * Calls a discovered tool, optionally decoding with a schema. Errors retain the full result.
   * Unbounded unless `timeout` is supplied.
   */
  readonly callTool: {
    (
      params: {
        readonly tool: McpSchema.Tool
        readonly schema?: undefined
        readonly arguments?: typeof McpSchema.CallTool.payloadSchema.Type["arguments"]
      },
      options?: { readonly timeout?: Duration.Input | undefined }
    ): Effect.Effect<McpSchema.CallToolResult, McpClientError>
    <S extends Schema.Top>(
      params: {
        readonly tool: McpSchema.Tool
        readonly schema: S
        readonly arguments?: typeof McpSchema.CallTool.payloadSchema.Type["arguments"]
      },
      options?: { readonly timeout?: Duration.Input | undefined }
    ): Effect.Effect<S["Type"], McpClientError, S["DecodingServices"]>
    <S extends Schema.Top = never>(
      params: {
        readonly tool: McpSchema.Tool
        readonly schema?: S | undefined
        readonly arguments?: typeof McpSchema.CallTool.payloadSchema.Type["arguments"]
      },
      options?: { readonly timeout?: Duration.Input | undefined }
    ): Effect.Effect<McpSchema.CallToolResult | S["Type"], McpClientError, S["DecodingServices"]>
  }
}

/**
 * Returns whether a value is an MCP client.
 *
 * @stability experimental
 * @category guards
 * @since 4.0.6
 */
export const isMcpClient = (value: unknown): value is McpClient => Predicate.hasProperty(value, TypeId)

// =============================================================================
// Constructors
// =============================================================================

/**
 * Constructs and connects a client using the supplied MCP transport service and its protocol adapter.
 *
 * **Details**
 *
 * `name`, `version` and the optional `title`, `description`, `websiteUrl` and
 * `icons` identify the client to the server. `timeout` defaults to 60 seconds
 * and bounds initialization and each complete `listTools`, `listPrompts`,
 * `listResources`, `listSkills` or `readResourceDirectory` scan.
 * `discoveryLimits` sets the default scan limits of 100 pages and 10,000
 * items. `callTool`, `getPrompt`, `readResource`, `getSkill` and
 * `readSkillResource` have no deadline unless their own `timeout` option is
 * supplied.
 *
 * `extensions` selects the protocol extensions the client declares. With
 * `skills: true` it declares the Skills extension (SEP-2640) and enables
 * `listSkills`, `getSkill`, `readResourceDirectory` and `readSkillResource`;
 * without it they fail with a `ConfigurationError`. They run only against a
 * server that declares the extension too, and skill entries are checked
 * against its rules. `readSkillResource` checks digests with SHA-256 on
 * `crypto.subtle`.
 * Schema decoding requires the schema's services from the caller.
 *
 * @stability experimental
 * @category constructors
 * @since 4.0.6
 */
export const make: (options: {
  readonly name: string
  readonly version: string
  readonly title?: string | undefined
  readonly description?: string | undefined
  readonly websiteUrl?: string | undefined
  readonly icons?: ReadonlyArray<McpSchema.Icon> | undefined
  readonly timeout?: Duration.Input | undefined
  readonly discoveryLimits?: {
    readonly maxPages?: number | undefined
    readonly maxItems?: number | undefined
  } | undefined
  readonly extensions?: {
    readonly skills?: boolean | undefined
  } | undefined
}) => Effect.Effect<
  McpClient,
  McpClientError,
  Scope.Scope | Transport
> = Effect.fnUntraced(function*(options: Options): Effect.fn.Return<
  McpClient,
  McpClientError,
  Scope.Scope | Transport
> {
  const transport = yield* Transport
  const protocol = transport.protocol
  const version = protocol.protocolVersion
  const modern = version === "2026-07-28"
  const timeout = options.timeout ?? DEFAULT_TIMEOUT
  const discoveryLimits = yield* resolveDiscoveryLimits(options.discoveryLimits, DEFAULT_DISCOVERY_LIMITS)
  const closed = yield* Deferred.make<never, McpClientError>()
  yield* Effect.addFinalizer(() =>
    Deferred.fail(closed, fail(new ClosedError({ description: "MCP client scope closed" })))
  )
  let nextId = 1

  const clientInfo = encodeImplementation({
    name: options.name,
    title: options.title,
    version: options.version,
    description: options.description,
    websiteUrl: options.websiteUrl,
    icons: options.icons
  })

  // Modern requests carry the client identity in every request.
  // https://modelcontextprotocol.io/specification/2026-07-28/basic/index
  const skillsEnabled = options.extensions?.skills === true
  const clientCapabilities = skillsEnabled ? { extensions: { [McpSkills.EXTENSION_ID]: {} } } : {}
  const meta = {
    "io.modelcontextprotocol/protocolVersion": version,
    "io.modelcontextprotocol/clientInfo": clientInfo,
    "io.modelcontextprotocol/clientCapabilities": clientCapabilities
  }

  const request = Effect.fnUntraced(function*<A>(
    method: string,
    params: Record<string, unknown>,
    tool?: McpSchema.Tool
  ): Effect.fn.Return<A, McpClientError> {
    const rpc = protocol.clientRpcs.requests.get(method) as Rpc.AnyWithProps | undefined
    if (rpc === undefined) {
      return yield* fail(new UnsupportedError({ description: `Unsupported MCP method: ${method}` }))
    }

    const codecs = protocol.payloadCodecs(rpc)
    const payload = yield* codecs.decode(modern ? { ...params, _meta: meta } : params).pipe(
      Effect.flatMap(codecs.encode),
      Effect.mapError(validationError)
    )

    const response = yield* transport.request(
      { jsonrpc: "2.0", id: nextId++, method, params: payload as Readonly<Record<string, unknown>> },
      tool
    )
    if ("error" in response) {
      return yield* fail(
        new ProtocolError({
          code: response.error.code,
          data: response.error.data,
          description: response.error.message
        })
      )
    }

    let result: unknown = response.result
    // Older modern peers may omit the complete discriminator.
    if (modern && isRecord(result) && result.resultType === undefined) result = { ...result, resultType: "complete" }
    if (method === "tools/list" && isRecord(result) && Array.isArray(result.tools)) {
      result = { ...result, tools: result.tools.filter((tool) => !requiresTasks(tool)) }
    }

    const validated = yield* decodeUnknown(rpc.successSchema, result)
    if (isRecord(result) && result.resultType === "input_required") {
      return yield* fail(new UnsupportedError({ description: "MCP input continuation is not supported" }))
    }
    const publicRpc = publicRpcs.get(method)
    return (publicRpc === undefined ? validated : yield* decodeUnknown(publicRpc.successSchema, result)) as A
  })

  // Initialization and discovery default to `timeout`; other operations are bounded only on request.
  const withDeadline = <A, E, R>(
    effect: Effect.Effect<A, E, R>,
    operation: string,
    duration: Duration.Input | undefined
  ) => {
    const open = Effect.raceFirst(effect, Deferred.await(closed))
    return duration === undefined ? open : open.pipe(
      Effect.timeoutOrElse({
        duration,
        orElse: () => Effect.fail(fail(new TimeoutError({ operation })))
      })
    )
  }

  const initialize = Effect.gen(function*() {
    if (!modern) {
      return yield* request<InitializeResult>("initialize", {
        protocolVersion: version,
        capabilities: clientCapabilities,
        clientInfo
      })
    }
    const discover = request<InitializeResult>("server/discover", {})
    // Retry once when the server rejects a version that it reports as supported.
    return yield* discover.pipe(Effect.catchIf((error) => {
      const reason = error.reason
      if (reason._tag !== "ProtocolError" && reason._tag !== "HttpError") return false
      const rejection = Option.getOrUndefined(decodeVersionRejection(reason.data))
      return reason.code === McpSchema.UNSUPPORTED_PROTOCOL_VERSION_ERROR_CODE && rejection?.requested === version &&
        rejection.supported.includes(version)
    }, () => discover))
  })

  const { capabilities, instructions, serverInfo } = yield* withDeadline(
    Effect.gen(function*() {
      const result = yield* initialize
      if (modern ? !result.supportedVersions?.includes(version) : result.protocolVersion !== version) {
        return yield* fail(
          new UnsupportedError({ description: "Server does not support the explicitly selected protocol version" })
        )
      }
      const identity = modern ? result._meta?.["io.modelcontextprotocol/serverInfo"] : result.serverInfo
      const capabilities = yield* decodeServerCapabilities(result.capabilities)
      const serverInfo = identity === undefined ? undefined : yield* decodeImplementation(identity)
      if (!modern) yield* transport.notify({ jsonrpc: "2.0", method: "notifications/initialized" })
      return { capabilities, instructions: result.instructions, serverInfo }
    }).pipe(
      Effect.mapError((cause) =>
        Schema.isSchemaError(cause)
          ? fail(new ProtocolError({ description: "Invalid MCP initialization result", cause }))
          : cause
      )
    ),
    "initialization",
    timeout
  )

  // Retrieval requires the capability; discovery treats a missing one as empty.
  const call = <A>(
    kind: Capability,
    method: string,
    params: Record<string, unknown>,
    tool?: McpSchema.Tool
  ): Effect.Effect<A, McpClientError> =>
    capabilities[kind] === undefined
      ? Effect.fail(fail(new UnsupportedError({ description: `Server does not advertise ${kind}` })))
      : request<A>(method, params, tool)

  const paginate = Effect.fnUntraced(function*<K extends string, A>(
    label: string,
    method: string,
    key: K,
    params: Record<string, unknown>,
    limits: typeof DEFAULT_DISCOVERY_LIMITS
  ) {
    const items: Array<A> = []
    const cursors = new Set<string>()
    let cursor: string | undefined
    for (let page = 0; page < limits.maxPages; page++) {
      const result = yield* request<ListResult<K, A>>(method, cursor === undefined ? params : { ...params, cursor })
      if (items.length + result[key].length > limits.maxItems) {
        return yield* limitError(`MCP ${label} discovery exceeded its item limit`)
      }
      for (const item of result[key]) items.push(item)
      if (result.nextCursor === undefined) return items
      if (cursors.has(result.nextCursor)) {
        return yield* limitError(`MCP ${label} discovery repeated a cursor`)
      }
      cursors.add(cursor = result.nextCursor)
    }
    return yield* limitError(`MCP ${label} discovery exceeded its page limit`)
  })

  const list = <K extends Capability, A>(kind: K) =>
    Effect.fnUntraced(
      function*(callOptions?: DiscoveryOptions) {
        const limits = yield* resolveDiscoveryLimits(callOptions?.limits, discoveryLimits)
        if (capabilities[kind] === undefined) return []
        return yield* paginate<K, A>(kind, `${kind}/list`, kind, {}, limits)
      },
      (effect, callOptions) => withDeadline(effect, `${kind} discovery`, callOptions?.timeout ?? timeout)
    )

  // Hosts must not call the extension's methods unless the server declares it,
  // and the extension requires the resources capability.
  const skillsSettings = capabilities.extensions?.[McpSkills.EXTENSION_ID]
  const servesSkills = isRecord(skillsSettings) && capabilities.resources !== undefined
  const servesDirectories = servesSkills && isRecord(skillsSettings) && skillsSettings.directoryRead === true
  const digest = yield* Effect.provide(Digest.Digest, Digest.layerWebCrypto)

  const invalid = (description: string) => Effect.fail(fail(new ValidationError({ description })))
  const unsupported = (description: string) => Effect.fail(fail(new UnsupportedError({ description })))
  const requireSkillsOption = skillsEnabled ? Effect.void : Effect.fail(
    fail(new ConfigurationError({ description: "MCP skills methods require extensions: { skills: true }" }))
  )

  const decodeSkill = Effect.fnUntraced(function*(entry: unknown) {
    const skill = yield* decodeUnknown(McpSchema.Skill, entry) as Effect.Effect<McpSchema.Skill, McpClientError>
    const problem = McpSkills.entryProblem(skill)
    return problem === undefined ? skill : yield* invalid(`Invalid MCP skill ${skill.uri}: ${problem}`)
  })

  const listSkills = Effect.fnUntraced(
    function*(options?: Parameters<McpClient["listSkills"]>[0]) {
      yield* requireSkillsOption
      const limits = yield* resolveDiscoveryLimits(options?.limits, discoveryLimits)
      if (!servesSkills) return []
      const entries = yield* paginate<"skills", unknown>("skills", "skills/list", "skills", {}, limits)
      // A catalog that changes between pages can list a skill twice; the first entry wins.
      const skills = new Map<string, McpSchema.Skill>()
      for (const entry of entries) {
        const decoded = yield* Effect.result(decodeSkill(entry))
        if (decoded._tag === "Failure") {
          if (options?.onInvalidSkill === undefined) return yield* Effect.fail(decoded.failure)
          yield* options.onInvalidSkill({ entry, error: decoded.failure })
          continue
        }
        if (!skills.has(decoded.success.uri)) skills.set(decoded.success.uri, decoded.success)
      }
      return Array.from(skills.values())
    },
    (effect, callOptions) => withDeadline(effect, "skills discovery", callOptions?.timeout ?? timeout)
  )

  const getSkill = Effect.fnUntraced(
    function*(params: { readonly uri: string }, _options?: CallOptions) {
      yield* requireSkillsOption
      if (!servesSkills) return yield* unsupported("Server does not declare the MCP Skills extension")
      const result = yield* request<{ readonly skill: unknown }>("skills/get", { uri: params.uri })
      const skill = yield* decodeSkill(result.skill)
      return skill.uri === params.uri
        ? skill
        : yield* invalid(`MCP server returned skill ${skill.uri} for ${params.uri}`)
    },
    (effect, _params, callOptions) => withDeadline(effect, "skills/get", callOptions?.timeout)
  )

  const readResourceDirectory = Effect.fnUntraced(
    function*(params: { readonly uri: string }, options?: DiscoveryOptions) {
      yield* requireSkillsOption
      const limits = yield* resolveDiscoveryLimits(options?.limits, discoveryLimits)
      if (!servesDirectories) {
        return yield* unsupported("Server does not declare directory reads for the MCP Skills extension")
      }
      const entries = yield* paginate<"resources", unknown>(
        "directory",
        "resources/directory/read",
        "resources",
        { uri: params.uri },
        limits
      )
      // A directory that changes between pages can list a child twice; the first entry wins.
      const children = new Map<string, McpSchema.Resource>()
      for (const entry of entries) {
        const child = yield* decodeUnknown(McpSchema.Resource, entry) as Effect.Effect<
          McpSchema.Resource,
          McpClientError
        >
        if (!McpSkills.isDirectChild(params.uri, child.uri)) {
          return yield* invalid(`${child.uri} is not a child of the MCP directory ${params.uri}`)
        }
        if (!children.has(child.uri)) children.set(child.uri, child)
      }
      return Array.from(children.values())
    },
    (effect, _params, callOptions) => withDeadline(effect, "directory discovery", callOptions?.timeout ?? timeout)
  )

  const readSkillResource = Effect.fnUntraced(
    function*(params: { readonly skill: McpSchema.Skill; readonly uri: string }, _options?: CallOptions) {
      yield* requireSkillsOption
      const { skill, uri } = params
      // A file missing from the manifest is a change to the skill, not a file to
      // trust. A dynamic skill has no manifest, so any file in its directory is read.
      const manifest = skill.resources === "dynamic" ? undefined : skill.resources
      const listed = manifest?.find((resource) => resource.uri === uri)
      if (manifest === undefined ? !McpSkills.isSkillFile(skill.uri, uri) : listed === undefined) {
        return yield* invalid(`${uri} is not a file of the MCP skill ${skill.uri}`)
      }
      const result = yield* call<McpSchema.ReadResourceResult>("resources", "resources/read", { uri })
      const [content, ...rest] = result.contents
      if (content === undefined || rest.length > 0 || content.uri !== uri) {
        return yield* invalid(`MCP resources/read returned other contents than ${uri}`)
      }
      const bytes = "text" in content ? encoder.encode(content.text) : content.blob
      if (listed !== undefined) {
        const actual = `sha256:${yield* digest.digestHex(Digest.sha256, bytes)}`
        if (bytes.byteLength !== listed.size || actual !== listed.digest) {
          return yield* invalid(`${uri} does not match the digest and size listed by the MCP skill ${skill.uri}`)
        }
      }
      if (uri !== skill.uri) return result
      // Verified bytes can still carry other frontmatter than the listing, and
      // hosts must not load a skill whose two descriptions differ.
      const frontmatter = McpSkills.parseFrontmatter("text" in content ? content.text : decoder.decode(bytes))
      return frontmatter !== undefined && Equal.equals(frontmatter, skill.frontmatter)
        ? result
        : yield* invalid(`The frontmatter of ${uri} differs from the frontmatter listed for the MCP skill`)
    },
    (effect, _params, callOptions) => withDeadline(effect, "resources/read", callOptions?.timeout)
  )

  const listTools = list<"tools", McpSchema.Tool>("tools")

  const callTool = Effect.fnUntraced(
    function*<S extends Schema.Top>(
      params: {
        readonly tool: McpSchema.Tool
        readonly schema?: S | undefined
        readonly arguments?: typeof McpSchema.CallTool.payloadSchema.Type["arguments"]
      },
      _options?: CallOptions
    ) {
      const result = yield* call<McpSchema.CallToolResult>(
        "tools",
        "tools/call",
        { name: params.tool.name, ...(params.arguments === undefined ? {} : { arguments: params.arguments }) },
        params.tool
      )
      if (params.schema === undefined) return result
      if (result.isError === true) {
        return yield* fail(new ToolError({ result }))
      }
      return yield* Schema.decodeUnknownEffect(params.schema)(result.structuredContent).pipe(
        Effect.mapError((cause) =>
          fail(new ValidationError({ description: "MCP structured result validation failed", cause }))
        )
      )
    },
    (effect, _params, callOptions) => withDeadline(effect, "tools/call", callOptions?.timeout)
  )

  return {
    [TypeId]: TypeId,
    protocolVersion: version,
    capabilities,
    serverInfo,
    instructions,
    listTools: (callOptions) =>
      listTools(callOptions).pipe(Effect.map((tools) => tools.filter((tool) => transport.isCallable(tool)))),
    listPrompts: list("prompts"),
    listResources: list("resources"),
    getPrompt: (params, callOptions) =>
      withDeadline(
        call<McpSchema.GetPromptResult>("prompts", "prompts/get", {
          name: params.prompt.name,
          ...(params.arguments === undefined ? {} : { arguments: params.arguments })
        }),
        "prompts/get",
        callOptions?.timeout
      ),
    readResource: (params, callOptions) =>
      withDeadline(
        call<McpSchema.ReadResourceResult>("resources", "resources/read", { uri: params.uri }),
        "resources/read",
        callOptions?.timeout
      ),
    listSkills,
    getSkill,
    readResourceDirectory,
    readSkillResource,
    callTool: callTool as McpClient["callTool"]
  }
})

// =============================================================================
// Toolkit
// =============================================================================

/**
 * Annotation containing the remote descriptor used to bind an MCP tool.
 *
 * **Details**
 *
 * The descriptor is server-provided and should be treated as untrusted.
 *
 * @stability experimental
 * @category services
 * @since 4.1.1
 */
export class ToolDescriptor
  extends Context.Service<ToolDescriptor, McpSchema.Tool>()("effect/ai/McpClient/ToolDescriptor")
{}

/**
 * Native tool bound to a remote MCP descriptor with configurable result and failure modes.
 *
 * @stability experimental
 * @category models
 * @since 4.1.1
 */
export type RemoteTool<
  ResultMode extends "text" | "complete" = "text",
  FailureMode extends Tool.FailureMode = "error",
  Requirements = never
> = FailureMode extends Tool.FailureMode ? Tool.Tool<string, {
    readonly parameters: typeof Schema.Unknown
    readonly success: {
      readonly text: typeof Schema.String
      readonly complete: typeof McpSchema.CallToolResult
    }[ResultMode]
    readonly failure: typeof McpClientError
    readonly failureMode: FailureMode
  }, Requirements>
  : never

/**
 * Binds remote tools using the standard Toolkit implementation.
 *
 * **Details**
 *
 * Pass a prefix such as `"reports__"` or an options object. Tools are discovered
 * unless an approved `tools` snapshot is supplied. Remote JSON Schemas are
 * advertised as-is, and model tool names must be 1–64 ASCII letters, digits,
 * underscores or hyphens. Build a new toolkit to pick up remote changes.
 *
 * By default results are text and failures fail the Effect.
 * `resultMode: "complete"` returns the full `CallToolResult` and sends its
 * content to the model as text and file parts. `failureMode: "return"` returns
 * typed failures, including transport errors, to the model; `ToolError` keeps
 * the failed result. Type arguments that select a non-default mode require the
 * matching option.
 *
 * `timeout` bounds each tool call. `trustAnnotations` copies server hints into
 * tool annotations but never sets approval. `transformTool` receives each
 * annotated tool before binding and must return a tool derived from it, e.g.
 * with `setNeedsApproval`, `annotate` or `addDependency`, keeping its name,
 * schemas and failure mode.
 *
 * @stability experimental
 * @category constructors
 * @since 4.0.6
 */
export function toolkit(
  client: McpClient,
  prefix?: string
): Effect.Effect<Toolkit.WithHandler<Record<string, RemoteTool>>, McpClientError>
export function toolkit<
  ResultMode extends "text" | "complete" = "text",
  FailureMode extends Tool.FailureMode = "error",
  Requirements = never
>(
  client: McpClient,
  options:
    & {
      readonly prefix?: string | undefined
      readonly tools?: ReadonlyArray<McpSchema.Tool> | undefined
      readonly trustAnnotations?: boolean | undefined
      readonly timeout?: Duration.Input | undefined
      readonly transformTool?:
        | ((
          tool: RemoteTool<ResultMode, FailureMode>,
          descriptor: McpSchema.Tool
        ) => RemoteTool<ResultMode, FailureMode, Requirements>)
        | undefined
    }
    // A mode may be omitted only when its type is exactly the default.
    & ([ResultMode] extends ["text"] ? { readonly resultMode?: "text" | undefined }
      : { readonly resultMode: ResultMode })
    & ([FailureMode] extends ["error"] ? { readonly failureMode?: "error" | undefined }
      : { readonly failureMode: FailureMode })
): Effect.Effect<
  Toolkit.WithHandler<Record<string, RemoteTool<ResultMode, FailureMode, Requirements>>>,
  McpClientError
>
export function toolkit(
  client: McpClient,
  options: string | ToolkitConfig = ""
): Effect.Effect<Toolkit.WithHandler<any>, McpClientError> {
  return Effect.gen(function*() {
    const config: ToolkitConfig = typeof options === "string" ? { prefix: options } : options
    const descriptors = config.tools ?? (yield* client.listTools())
    const complete = config.resultMode === "complete"
    const success = complete ? McpSchema.CallToolResult : Schema.String
    const failureMode = config.failureMode ?? "error"
    const tools: Array<Tool.Any> = []
    const handlers: Record<
      string,
      (params: unknown) => Effect.Effect<string | McpSchema.CallToolResult, McpClientError>
    > = Object.create(null)

    for (const descriptor of descriptors) {
      const name = `${config.prefix ?? ""}${descriptor.name}`
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(name) || Object.hasOwn(handlers, name)) {
        return yield* fail(new ConfigurationError({ description: `Invalid or duplicate MCP model tool name: ${name}` }))
      }
      const spec = {
        parameters: descriptor.inputSchema,
        description: descriptor.description,
        success,
        failure: McpClientError,
        toModelOutput: complete ? toModelOutput : undefined
      }
      // The identical branches narrow `failureMode` to a single `RemoteTool` member.
      let tool: RemoteTool<"text" | "complete", Tool.FailureMode> = (
        failureMode === "return"
          ? Tool.dynamic(name, { ...spec, failureMode })
          : Tool.dynamic(name, { ...spec, failureMode })
      ).annotate(Tool.Strict, false).annotate(ToolDescriptor, descriptor)
      if (config.trustAnnotations && descriptor.annotations !== undefined) {
        tool = tool.annotate(Tool.Readonly, descriptor.annotations.readOnlyHint)
          .annotate(Tool.Destructive, descriptor.annotations.destructiveHint)
          .annotate(Tool.Idempotent, descriptor.annotations.idempotentHint)
          .annotate(Tool.OpenWorld, descriptor.annotations.openWorldHint)
        if (descriptor.annotations.title !== undefined) tool = tool.annotate(Tool.Title, descriptor.annotations.title)
      }
      tools.push(config.transformTool === undefined ? tool : config.transformTool(tool, descriptor))
      handlers[name] = Effect.fnUntraced(function*(params: unknown) {
        const args = yield* decodeToolArguments(params).pipe(
          Effect.mapError((cause) =>
            fail(new ValidationError({ description: "MCP tool arguments must be a JSON object", cause }))
          )
        )
        const result = yield* client.callTool({ tool: descriptor, arguments: args }, { timeout: config.timeout })
        if (result.isError === true) return yield* fail(new ToolError({ result }))
        return complete ? result : yield* toText(result)
      })
    }

    const toolkit = Toolkit.make(...tools)
    return yield* toolkit.pipe(Effect.provideContext(yield* toolkit.toHandlers(handlers)))
  })
}

// =============================================================================
// Transports
// =============================================================================

/**
 * Service supplied by the built-in MCP transport constructors and layers.
 *
 * **Details**
 *
 * Transport construction owns cleanup through its Effect scope.
 *
 * @stability experimental
 * @category services
 * @since 4.0.6
 */
export const Transport: Context.Service<Transport, Transport> = Context.Service<Transport>(
  "effect/ai/McpClient/Transport"
)

/**
 * Exchanges JSON-RPC messages with one MCP server using its protocol adapter.
 *
 * @stability experimental
 * @category models
 * @since 4.0.6
 */
export interface Transport {
  readonly [TransportTypeId]: typeof TransportTypeId
  readonly protocol: McpProtocol.ProtocolAdapter<ProtocolVersion>
  /** Sends a request and waits for its response. `tool` supplies header routing for tool calls. */
  readonly request: (
    message: McpSchema.JsonRpcRequest,
    tool?: McpSchema.Tool
  ) => Effect.Effect<McpSchema.JsonRpcResponse, McpClientError>
  /** Sends a notification without waiting for a reply. */
  readonly notify: (message: McpSchema.JsonRpcNotification) => Effect.Effect<void, McpClientError>
  /** Returns whether the transport can route a call to the tool. */
  readonly isCallable: (tool: McpSchema.Tool) => boolean
}

/**
 * Starts a scoped subprocess using newline-delimited JSON-RPC.
 *
 * @stability experimental
 * @category constructors
 * @since 4.0.6
 */
export const stdio: (options: {
  readonly command: ChildProcess.Command
  readonly protocol: McpProtocol.ProtocolAdapter<ProtocolVersion>
  readonly maxMessageBytes?: ByteSize.Input | undefined
}) => Effect.Effect<Transport, McpClientError, ChildProcessSpawner | Scope.Scope> = Effect.fnUntraced(
  function*(options: {
    readonly command: ChildProcess.Command
    readonly protocol: Protocol
    readonly maxMessageBytes?: ByteSize.Input | undefined
  }): Effect.fn.Return<Transport, McpClientError, ChildProcessSpawner | Scope.Scope> {
    const maxBytes = yield* messageLimit(options.maxMessageBytes)
    const spawner = yield* ChildProcessSpawner
    const process = yield* spawner.spawn(options.command).pipe(
      Effect.mapError((cause) => fail(new TransportError({ description: "Cannot spawn MCP server", cause })))
    )

    const pending = new Map<McpSchema.RequestId, Deferred.Deferred<McpSchema.JsonRpcResponse>>()
    const failure = yield* Deferred.make<never, McpClientError>()
    let failed: McpClientError | undefined

    const close = (error: McpClientError) =>
      Effect.suspend(() => {
        failed ??= error
        return Deferred.fail(failure, failed)
      })

    const input = yield* Queue.unbounded<string, Cause.Done>()

    const write = Effect.fnUntraced(function*(message: McpSchema.JsonRpcMessage) {
      if (failed !== undefined) return yield* failed
      const json = yield* encodeMessage(message, maxBytes)
      yield* Queue.offer(input, json + "\n")
    })

    const receive = Effect.fnUntraced(function*(message: McpSchema.JsonRpcMessage) {
      if (isRequest(message)) return yield* write(replyToServer(message))
      if (!isResponse(message)) return
      // Without an ID the error cannot be correlated, so no pending request can be trusted.
      if (message.id === undefined || message.id === null) {
        return yield* fail(new ProtocolError({ description: "Server returned an uncorrelated JSON-RPC error" }))
      }
      const response = pending.get(message.id)
      if (response !== undefined) yield* Deferred.succeed(response, message)
    })

    yield* Stream.fromQueue(input).pipe(
      Stream.encodeText,
      Stream.run(process.stdin),
      Effect.catch((cause) => close(fail(new TransportError({ description: "MCP stdin failed", cause })))),
      Effect.forkScoped
    )
    yield* Stream.runDrain(process.stderr).pipe(Effect.ignore, Effect.forkScoped)
    const drained = yield* Deferred.make<void>()
    let buffer = ""
    yield* process.stdout.pipe(
      Stream.decodeText(),
      Stream.runForEach(Effect.fnUntraced(function*(chunk) {
        buffer += chunk
        let start = 0
        let index: number
        while ((index = buffer.indexOf("\n", start)) >= 0) {
          const line = buffer.slice(start, index)
          start = index + 1
          if (line.trim() !== "") yield* receive(yield* parseMessage(line, maxBytes))
        }
        buffer = buffer.slice(start)
        if (buffer.length > maxBytes) {
          return yield* limitError("MCP message exceeds maxMessageBytes")
        }
      })),
      Effect.mapError((cause) =>
        isMcpClientError(cause)
          ? cause
          : fail(new TransportError({ description: "MCP stdout failed", cause }))
      ),
      Effect.andThen(Effect.fail(fail(new TransportError({ description: "MCP server closed stdout" })))),
      Effect.catch(close),
      Effect.ensuring(Deferred.succeed(drained, undefined)),
      Effect.forkScoped
    )
    // Output written just before exit is delivered before pending requests fail.
    yield* process.exitCode.pipe(
      Effect.map((code) => `MCP process exited (${code})`),
      Effect.orElseSucceed(() => "MCP process exited"),
      Effect.tap(() => Deferred.await(drained).pipe(Effect.timeoutOption(CLOSE_TIMEOUT))),
      Effect.flatMap((description) => close(fail(new TransportError({ description })))),
      Effect.forkScoped
    )

    // Close stdin, then escalate to SIGTERM and SIGKILL if the server does not exit.
    // https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#stdio
    yield* Effect.addFinalizer(Effect.fnUntraced(function*() {
      yield* close(fail(new ClosedError({ description: "MCP transport closed" })))
      yield* Queue.end(input)
      const exited = yield* process.exitCode.pipe(Effect.timeoutOption(CLOSE_TIMEOUT), Effect.option)
      if (Option.isNone(exited) || Option.isNone(exited.value)) {
        yield* process.kill({ killSignal: "SIGTERM", forceKillAfter: Duration.toMillis(CLOSE_TIMEOUT) }).pipe(
          Effect.ignore
        )
      }
    }))

    return {
      [TransportTypeId]: TransportTypeId,
      protocol: options.protocol,
      isCallable: () => true,
      notify: write,
      request: Effect.fnUntraced(function*(message) {
        const response = yield* Deferred.make<McpSchema.JsonRpcResponse>()
        pending.set(message.id, response)

        return yield* write(message).pipe(
          Effect.andThen(Deferred.await(response)),
          Effect.raceFirst(Deferred.await(failure)),
          Effect.onInterrupt(() =>
            message.method === "initialize"
              ? Effect.void
              : Deferred.isDone(response).pipe(
                Effect.flatMap((done) => done ? Effect.void : write(cancelled(message.id)).pipe(Effect.ignore))
              )
          ),
          Effect.ensuring(Effect.sync(() => pending.delete(message.id)))
        )
      })
    }
  }
)

/**
 * Provides a connected MCP client over stdio using the child process spawner.
 *
 * **Details**
 *
 * The layer scope owns the client and subprocess. The options are those of
 * {@link make} and {@link stdio}.
 *
 * @see {@link layerHttp}
 * @stability experimental
 * @category layers
 * @since 4.0.6
 */
export const layerStdio: (options: {
  readonly name: string
  readonly version: string
  readonly title?: string | undefined
  readonly description?: string | undefined
  readonly websiteUrl?: string | undefined
  readonly icons?: ReadonlyArray<McpSchema.Icon> | undefined
  readonly timeout?: Duration.Input | undefined
  readonly discoveryLimits?: {
    readonly maxPages?: number | undefined
    readonly maxItems?: number | undefined
  } | undefined
  readonly extensions?: {
    readonly skills?: boolean | undefined
  } | undefined
  readonly command: ChildProcess.Command
  readonly protocol: McpProtocol.ProtocolAdapter<ProtocolVersion>
  readonly maxMessageBytes?: ByteSize.Input | undefined
}) => Layer.Layer<
  McpClient,
  McpClientError,
  ChildProcessSpawner
> = (options) => Layer.effect(McpClient)(make(options)).pipe(Layer.provide(Layer.effect(Transport)(stdio(options))))

/**
 * Creates a Streamable HTTP transport with request-owned JSON or SSE responses.
 *
 * @stability experimental
 * @category constructors
 * @since 4.0.6
 */
export const http: (options: {
  readonly url: string | URL
  readonly protocol: McpProtocol.ProtocolAdapter<ProtocolVersion>
  readonly headers?: Readonly<Record<string, string>> | undefined
  readonly maxMessageBytes?: ByteSize.Input | undefined
}) => Effect.Effect<Transport, McpClientError, HttpClient.HttpClient | Scope.Scope> = Effect.fnUntraced(
  function*(options: {
    readonly url: string | URL
    readonly protocol: Protocol
    readonly headers?: Readonly<Record<string, string>> | undefined
    readonly maxMessageBytes?: ByteSize.Input | undefined
  }): Effect.fn.Return<Transport, McpClientError, HttpClient.HttpClient | Scope.Scope> {
    const maxBytes = yield* messageLimit(options.maxMessageBytes)
    const client = HttpClient.withScope(yield* HttpClient.HttpClient)
    const modern = options.protocol.protocolVersion === "2026-07-28"
    const closed = yield* Deferred.make<never, McpClientError>()
    let failed: McpClientError | undefined
    // Legacy servers may assign a session during initialization.
    let session: string | undefined

    const baseHeaders = {
      ...options.headers,
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": options.protocol.protocolVersion
    }
    const headers = (): Record<string, string> =>
      session === undefined ? baseHeaders : { ...baseHeaders, "mcp-session-id": session }

    const httpError = Effect.fnUntraced(function*(response: HttpClientResponse.HttpClientResponse) {
      // Error bodies may carry a JSON-RPC error without an ID, e.g. an unsupported protocol version.
      const remote = mediaType(response) === "application/json"
        ? yield* readBody(response, maxBytes).pipe(
          Effect.flatMap((text) => parseMessage(text, maxBytes)),
          Effect.map((message) => "error" in message ? message.error : undefined),
          Effect.orElseSucceed(() => undefined)
        )
        : undefined
      return yield* fail(
        new HttpError({
          status: response.status,
          code: remote?.code,
          data: remote?.data,
          description: remote?.message,
          wwwAuthenticate: response.headers["www-authenticate"],
          retryAfter: response.headers["retry-after"]
        })
      )
    })

    // Posts one message and returns the successful response, tracking legacy sessions.
    const send = Effect.fnUntraced(function*(message: McpSchema.JsonRpcMessage, tool?: McpSchema.Tool) {
      if (failed !== undefined) return yield* failed
      const body = yield* encodeMessage(message, maxBytes)
      const request = HttpClientRequest.post(options.url).pipe(
        HttpClientRequest.setHeaders({ ...headers(), ...(modern ? yield* routingHeaders(message, tool) : {}) }),
        HttpClientRequest.bodyText(body, "application/json")
      )
      const response = yield* client.execute(request).pipe(
        // Clients using `filterStatusOk` surface error responses as failures.
        Effect.catch((cause) =>
          cause.response === undefined
            ? Effect.fail(fail(new TransportError({ description: "MCP HTTP request failed", cause })))
            : Effect.succeed(cause.response)
        )
      )

      // A legacy session ends when the server no longer recognizes its ID.
      if (session !== undefined && response.status === 404) {
        failed ??= fail(new ClosedError({ sessionExpired: true }))
        return yield* failed
      }
      if (response.status < 200 || response.status >= 300) return yield* httpError(response)
      if (!modern) session = response.headers["mcp-session-id"] ?? session
      return response
    })

    const exchange = <A>(effect: Effect.Effect<A, unknown, Scope.Scope>) =>
      effect.pipe(
        Effect.mapError((cause) =>
          isMcpClientError(cause)
            ? cause
            : fail(new TransportError({ description: "Cannot read MCP response", cause }))
        ),
        Effect.raceFirst(Deferred.await(closed)),
        Effect.scoped
      )

    const notify = (message: McpSchema.JsonRpcNotification | McpSchema.JsonRpcResponse) =>
      exchange(Effect.asVoid(send(message)))

    const readResponse = Effect.fnUntraced(function*(
      response: HttpClientResponse.HttpClientResponse,
      request: McpSchema.JsonRpcRequest
    ) {
      const match = Effect.fnUntraced(function*(message: McpSchema.JsonRpcMessage) {
        if (isRequest(message)) {
          yield* notify(replyToServer(message))
          return undefined
        }
        if (!isResponse(message)) return undefined
        // A response on this exchange belongs to its request; an error may omit the ID.
        if (message.id !== request.id && !("error" in message && message.id == null)) {
          return yield* fail(new ProtocolError({ description: "HTTP MCP response id does not match its request" }))
        }
        return message
      })

      switch (mediaType(response)) {
        case "application/json": {
          const message = yield* match(yield* parseMessage(yield* readBody(response, maxBytes), maxBytes))
          if (message === undefined) break
          return message
        }
        case "text/event-stream": {
          const events: Array<string> = []
          const parser = Sse.makeParser((event) => {
            // Resumption is unsupported, so retry directives and event IDs are ignored.
            if (event._tag === "Event" && event.data !== "") events.push(event.data)
          }, { maxEventSize: maxBytes })
          const message = yield* response.stream.pipe(
            Stream.decodeText(),
            Stream.flatMap((chunk) => {
              const error = parser.feed(chunk)
              const parsed = Stream.fromIterable(events.splice(0))
              // Events before an oversized one can still complete the request.
              return error === undefined ? parsed : parsed.pipe(
                Stream.concat(Stream.fail(limitError("MCP SSE event exceeds maxMessageBytes")))
              )
            }),
            Stream.mapEffect((data) => parseMessage(data, maxBytes).pipe(Effect.flatMap(match))),
            Stream.filter(Predicate.isNotUndefined),
            Stream.runHead
          )
          if (Option.isNone(message)) break
          return message.value
        }
        default: {
          return yield* fail(new ProtocolError({ description: "Unsupported MCP response Content-Type" }))
        }
      }
      return yield* fail(new TransportError({ description: "MCP response ended before the terminal response" }))
    })

    yield* Effect.addFinalizer(Effect.fnUntraced(function*() {
      failed ??= fail(new ClosedError({ description: "MCP HTTP transport closed" }))
      yield* Deferred.fail(closed, failed)
      if (session === undefined || failed.reason._tag !== "ClosedError" || failed.reason.sessionExpired) return
      // Explicitly terminate a legacy session.
      // https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#session-management
      yield* client.execute(HttpClientRequest.delete(options.url).pipe(HttpClientRequest.setHeaders(headers()))).pipe(
        Effect.scoped,
        Effect.timeoutOption(CLOSE_TIMEOUT),
        Effect.ignore
      )
    }))

    return {
      [TransportTypeId]: TransportTypeId,
      protocol: options.protocol,
      isCallable: (tool) => !modern || headerParameters(tool) !== undefined,
      notify,
      request: (message, tool) =>
        exchange(
          send(message, tool).pipe(
            Effect.flatMap((response) =>
              response.status === 202 || response.status === 204
                ? fail(new ProtocolError({ description: "MCP request received no response" }))
                : readResponse(response, message)
            )
          )
        ).pipe(
          // Modern servers treat a closed response stream as cancellation.
          Effect.onInterrupt(() =>
            modern || message.method === "initialize"
              ? Effect.void
              : notify(cancelled(message.id)).pipe(Effect.timeoutOption(CLOSE_TIMEOUT), Effect.ignore)
          )
        )
    }
  }
)

/**
 * Provides a connected MCP client over Streamable HTTP using the HTTP client.
 *
 * **Details**
 *
 * The layer scope owns the client and connection. The options are those of
 * {@link make} and {@link http}.
 *
 * **Example** (Providing an HTTP client connection)
 *
 * ```ts import.meta.vitest
 * import { Layer } from "effect"
 * import { McpClient, McpProtocol } from "effect/ai"
 * import { FetchHttpClient } from "effect/http"
 *
 * const ClientLayer = McpClient.layerHttp({
 *   name: "report-workflow",
 *   version: "1.0.0",
 *   protocol: McpProtocol.v2026_07_28,
 *   url: "http://localhost:3000/mcp"
 * }).pipe(Layer.provide(FetchHttpClient.layer))
 * ```
 *
 * @see {@link layerStdio}
 * @stability experimental
 * @category layers
 * @since 4.0.6
 */
export const layerHttp: (options: {
  readonly name: string
  readonly version: string
  readonly title?: string | undefined
  readonly description?: string | undefined
  readonly websiteUrl?: string | undefined
  readonly icons?: ReadonlyArray<McpSchema.Icon> | undefined
  readonly timeout?: Duration.Input | undefined
  readonly discoveryLimits?: {
    readonly maxPages?: number | undefined
    readonly maxItems?: number | undefined
  } | undefined
  readonly extensions?: {
    readonly skills?: boolean | undefined
  } | undefined
  readonly url: string | URL
  readonly protocol: McpProtocol.ProtocolAdapter<ProtocolVersion>
  readonly headers?: Readonly<Record<string, string>> | undefined
  readonly maxMessageBytes?: ByteSize.Input | undefined
}) => Layer.Layer<
  McpClient,
  McpClientError,
  HttpClient.HttpClient
> = (options) => Layer.effect(McpClient)(make(options)).pipe(Layer.provide(Layer.effect(Transport)(http(options))))

// =============================================================================
// Internal
// =============================================================================

const TypeId = "~effect/ai/McpClient" as const
const TransportTypeId = "~effect/ai/McpClient/Transport" as const
const DEFAULT_MAX_MESSAGE_BYTES = ByteSize.mebibytes(16)
const DEFAULT_TIMEOUT = Duration.seconds(60)
const CLOSE_TIMEOUT = Duration.seconds(5)
const DEFAULT_DISCOVERY_LIMITS = { maxPages: 100, maxItems: 10_000 }
const HEADER_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/
const encoder = new TextEncoder()
const decoder = new TextDecoder()

type Protocol = McpProtocol.ProtocolAdapter<ProtocolVersion>

type Options = Parameters<typeof make>[0]

type Capability = "tools" | "prompts" | "resources"

type DiscoveryOptions = NonNullable<Parameters<McpClient["listTools"]>[0]>

type DiscoveryLimits = DiscoveryOptions["limits"]

interface CallOptions {
  readonly timeout?: Duration.Input | undefined
}

interface InitializeResult {
  readonly protocolVersion?: string
  readonly supportedVersions?: ReadonlyArray<string>
  readonly capabilities: unknown
  readonly serverInfo?: unknown
  readonly instructions?: string
  readonly _meta?: Record<string, unknown>
}

type ListResult<K extends string, A> = Record<K, ReadonlyArray<A>> & { readonly nextCursor?: string }
const fail = (reason: McpClientErrorReason) => new McpClientError({ reason })
const limitError = (description: string) => fail(new LimitError({ description }))

const resolveDiscoveryLimits = (
  limits: DiscoveryLimits,
  defaults: typeof DEFAULT_DISCOVERY_LIMITS
): Effect.Effect<typeof DEFAULT_DISCOVERY_LIMITS, McpClientError> => {
  const maxPages = limits?.maxPages ?? defaults.maxPages
  const maxItems = limits?.maxItems ?? defaults.maxItems
  return Number.isSafeInteger(maxPages) && maxPages >= 0 && Number.isSafeInteger(maxItems) && maxItems >= 0
    ? Effect.succeed({ maxPages, maxItems })
    : Effect.fail(
      fail(new ConfigurationError({ description: "MCP discovery limits must be nonnegative safe integers" }))
    )
}

const validationError = (cause: Schema.SchemaError) =>
  fail(new ValidationError({ description: "Invalid MCP payload", cause }))

const isRecord = Predicate.isReadonlyObject
const decodeMessage = Schema.decodeUnknownEffect(McpSchema.JsonRpcMessage, { onExcessProperty: "error" })

const decodeVersionRejection = Schema.decodeUnknownOption(Schema.Struct({
  requested: Schema.String,
  supported: Schema.Array(Schema.String)
}))

const decodeServerCapabilities = Schema.decodeUnknownEffect(McpSchema.ServerCapabilities)
const decodeImplementation = Schema.decodeUnknownEffect(McpSchema.Implementation)
const encodeImplementation = Schema.encodeSync(McpSchema.Implementation)

// The protocol payload codec validates argument values; the toolkit only checks for an object.
const decodeToolArguments = Schema.decodeUnknownEffect(Schema.Record(Schema.String, Schema.Unknown))

const decodeUnknown = (schema: Schema.Constraint, value: unknown) =>
  Schema.decodeUnknownEffect(schema as Schema.ConstraintCodec<unknown, unknown>)(value).pipe(
    Effect.mapError(validationError)
  )

const publicRpcs: ReadonlyMap<string, { readonly successSchema: Schema.Constraint }> =
  McpSchema.ClientRequestRpcs.requests

// Tools that require task-augmented execution cannot be called without the tasks extension.
const requiresTasks = (tool: unknown) =>
  isRecord(tool) && isRecord(tool.execution) && tool.execution.taskSupport === "required"

const messageLimit = (input: ByteSize.Input = DEFAULT_MAX_MESSAGE_BYTES) => {
  const bytes = Option.flatMap(ByteSize.fromInput(input), ByteSize.toNumber)
  return Option.isSome(bytes) && bytes.value > 0
    ? Effect.succeed(bytes.value)
    : Effect.fail(fail(new ConfigurationError({ description: "maxMessageBytes must be a positive safe integer" })))
}

const encodeMessage = Effect.fnUntraced(function*(message: McpSchema.JsonRpcMessage, maxBytes: number) {
  const json = yield* Effect.try({
    try: () => JSON.stringify(message),
    catch: (cause) => fail(new TransportError({ description: "Cannot encode MCP message", cause }))
  })
  if (encoder.encode(json).length > maxBytes) {
    return yield* limitError("MCP message exceeds maxMessageBytes")
  }
  return json
})

const parseMessage = Effect.fnUntraced(function*(text: string, maxBytes: number) {
  if (encoder.encode(text).length > maxBytes) {
    return yield* limitError("MCP message exceeds maxMessageBytes")
  }
  const json = yield* Effect.try({
    try: () => JSON.parse(text) as unknown,
    catch: (cause) => fail(new ProtocolError({ description: "Invalid MCP JSON", cause }))
  })
  return yield* decodeMessage(json).pipe(
    Effect.mapError((cause) => fail(new ProtocolError({ description: "Invalid JSON-RPC message", cause })))
  )
})

const isRequest = (message: McpSchema.JsonRpcMessage): message is McpSchema.JsonRpcRequest =>
  "method" in message && "id" in message

const isResponse = (message: McpSchema.JsonRpcMessage): message is McpSchema.JsonRpcResponse => !("method" in message)

// The client advertises no capability that lets a server send it requests, so it answers pings and
// declines every other server request.
const replyToServer = (request: McpSchema.JsonRpcRequest): McpSchema.JsonRpcResponse =>
  request.method === "ping"
    ? { jsonrpc: "2.0", id: request.id, result: {} }
    : {
      jsonrpc: "2.0",
      id: request.id,
      error: { code: McpSchema.METHOD_NOT_FOUND_ERROR_CODE, message: `Unsupported MCP method: ${request.method}` }
    }

const cancelled = (id: McpSchema.RequestId): McpSchema.JsonRpcNotification => ({
  jsonrpc: "2.0",
  method: "notifications/cancelled",
  params: { requestId: id }
})

// =============================================================================
// Internal: Streamable HTTP
// =============================================================================

const mediaType = (response: HttpClientResponse.HttpClientResponse) =>
  response.headers["content-type"]?.split(";", 1)[0].trim().toLowerCase()

const readBody = (response: HttpClientResponse.HttpClientResponse, maxBytes: number) =>
  response.stream.pipe(
    Stream.mapError((cause) => fail(new TransportError({ description: "Cannot read MCP response", cause }))),
    Stream.limitBytes(maxBytes, () => Stream.fail(limitError("MCP response exceeds maxMessageBytes"))),
    Stream.mkUint8Array,
    Effect.map((bytes) => decoder.decode(bytes))
  )

// Values that are not plain visible ASCII are sent Base64 encoded.
// https://modelcontextprotocol.io/specification/2026-07-28/basic/transports#custom-headers-from-tool-parameters
const headerValue = (value: string) =>
  /^[\x20-\x7e]*$/.test(value) && value.trim() === value &&
    !(value.startsWith(BASE64_SENTINEL_PREFIX) && value.endsWith(BASE64_SENTINEL_SUFFIX))
    ? value
    : `${BASE64_SENTINEL_PREFIX}${Base64.encode(value)}${BASE64_SENTINEL_SUFFIX}`

interface HeaderParameter {
  readonly path: ReadonlyArray<string>
  readonly header: string
  readonly type: string
}

// JSON Schema keywords whose values are schemas, maps of schemas or arrays of schemas.
const SCHEMA_KEYWORDS = new Set([
  "additionalProperties",
  "unevaluatedProperties",
  "propertyNames",
  "items",
  "additionalItems",
  "unevaluatedItems",
  "contains",
  "not",
  "if",
  "then",
  "else",
  "contentSchema"
])

const SCHEMA_MAP_KEYWORDS = new Set([
  "properties",
  "patternProperties",
  "$defs",
  "definitions",
  "dependentSchemas",
  "dependencies"
])

const SCHEMA_ARRAY_KEYWORDS = new Set(["allOf", "anyOf", "oneOf", "prefixItems", "items"])

// Collects `x-mcp-header` annotations along chains of `properties` keys, or
// returns undefined when an annotation is invalid or found anywhere else.
// https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#schema-extension
const headerParameters = (tool: McpSchema.Tool): ReadonlyArray<HeaderParameter> | undefined => {
  const parameters: Array<HeaderParameter> = []
  const names = new Set<string>()

  // `path` is undefined once the traversal leaves a properties-only chain.
  const visit = (schema: unknown, path: ReadonlyArray<string> | undefined): boolean => {
    if (!isRecord(schema)) return true
    const name = schema["x-mcp-header"]
    if (name !== undefined) {
      if (
        path === undefined || path.length === 0 || typeof name !== "string" || !HEADER_TOKEN.test(name) ||
        names.has(name.toLowerCase()) || !["string", "integer", "boolean"].includes(schema.type as string)
      ) return false
      names.add(name.toLowerCase())
      parameters.push({ path, header: `mcp-param-${name.toLowerCase()}`, type: schema.type as string })
    }
    return Object.entries(schema).every(([keyword, value]) => {
      if (SCHEMA_MAP_KEYWORDS.has(keyword) && isRecord(value)) {
        return Object.entries(value).every(([key, child]) =>
          visit(child, keyword === "properties" && path !== undefined ? [...path, key] : undefined)
        )
      }
      if (Array.isArray(value)) {
        return !SCHEMA_ARRAY_KEYWORDS.has(keyword) || value.every((child) => visit(child, undefined))
      }
      return !SCHEMA_KEYWORDS.has(keyword) || visit(value, undefined)
    })
  }

  return visit(tool.inputSchema, []) ? parameters : undefined
}

const routingHeaders = Effect.fnUntraced(function*(message: McpSchema.JsonRpcMessage, tool?: McpSchema.Tool) {
  if (!("method" in message)) return {}
  const headers: Record<string, string> = { "mcp-method": message.method }
  const params = message.params ?? {}
  const name = message.method === "resources/read" ? params.uri : params.name
  if (
    typeof name === "string" &&
    (message.method === "tools/call" || message.method === "prompts/get" || message.method === "resources/read")
  ) {
    headers["mcp-name"] = headerValue(name)
  }
  if (message.method !== "tools/call") return headers

  const parameters = tool === undefined ? undefined : headerParameters(tool)
  if (parameters === undefined) {
    return yield* fail(new UnsupportedError({ description: "Tool has invalid x-mcp-header annotations" }))
  }
  for (const { header, path, type } of parameters) {
    let value: unknown = params.arguments
    for (const key of path) value = isRecord(value) && Object.hasOwn(value, key) ? value[key] : undefined
    if (value === undefined || value === null) continue
    if (type === "integer" ? !Number.isSafeInteger(value) : typeof value !== type) {
      return yield* fail(new ValidationError({ description: `Invalid value for MCP header parameter ${header}` }))
    }
    headers[header] = headerValue(String(value))
  }
  return headers
})

// =============================================================================
// Internal: Toolkit
// =============================================================================

interface ToolkitConfig {
  readonly prefix?: string | undefined
  readonly tools?: ReadonlyArray<McpSchema.Tool> | undefined
  readonly resultMode?: "text" | "complete" | undefined
  readonly failureMode?: Tool.FailureMode | undefined
  readonly trustAnnotations?: boolean | undefined
  readonly timeout?: Duration.Input | undefined
  readonly transformTool?:
    | ((tool: RemoteTool<"text" | "complete", Tool.FailureMode>, descriptor: McpSchema.Tool) => Tool.Any)
    | undefined
}

const toModelOutput = (result: McpSchema.CallToolResult): Array<Prompt.ToolModelOutputPart> => {
  const parts: Array<Prompt.ToolModelOutputPart> = []
  for (const block of result.content) {
    switch (block.type) {
      case "text": {
        parts.push(Prompt.textPart({ text: block.text }))
        break
      }
      case "image":
      case "audio": {
        parts.push(Prompt.filePart({ mediaType: block.mimeType, data: block.data }))
        break
      }
      case "resource_link": {
        parts.push(Prompt.textPart({ text: resourceLinkText(block) }))
        break
      }
      case "resource": {
        parts.push(
          "text" in block.resource
            ? Prompt.textPart({ text: block.resource.text })
            : Prompt.filePart({
              mediaType: block.resource.mimeType ?? "application/octet-stream",
              data: block.resource.blob
            })
        )
        break
      }
    }
  }
  if (parts.length === 0 && result.structuredContent !== undefined) {
    parts.push(Prompt.textPart({ text: JSON.stringify(result.structuredContent) }))
  }
  return parts
}

const resourceLinkText = (link: McpSchema.ResourceLink) =>
  `${link.title ?? link.name}: ${link.uri}${link.description === undefined ? "" : `\n${link.description}`}`

const toText = (result: McpSchema.CallToolResult): Effect.Effect<string, McpClientError> => {
  const unsupported = (content: string) =>
    Effect.fail(
      fail(new UnsupportedError({ description: `MCP ${content} requires an application text converter`, result }))
    )
  const parts: Array<string> = []
  for (const block of result.content) {
    switch (block.type) {
      case "text": {
        parts.push(block.text)
        break
      }
      case "resource_link": {
        parts.push(resourceLinkText(block))
        break
      }
      case "resource": {
        if (!("text" in block.resource)) return unsupported("binary resources")
        parts.push(block.resource.text)
        break
      }
      default: {
        return unsupported(`${block.type} content`)
      }
    }
  }
  return Effect.succeed(
    parts.length === 0 && result.structuredContent !== undefined
      ? JSON.stringify(result.structuredContent)
      : parts.join("\n")
  )
}
