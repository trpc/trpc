/**
 * Spike (proposal 25): publish a router's procedures as MCP tools.
 *
 * - `mcp()` is a root extension, like `experimental_openapi()`: it adds the `mcp` meta key
 *   (`.meta({ mcp: { description, annotations } })`), merged key by key.
 * - `describeTools(router)` turns procedures into MCP tool descriptors, with
 *   JSON Schemas from `toContract()` (Standard JSON Schema, the OpenAPI
 *   generator's path), so nothing here converts schemas itself.
 * - `createMcpHandler({ router })` serves MCP's Streamable HTTP transport,
 *   stateless: one JSON-RPC request per POST, answered with JSON. No
 *   sessions, no server-to-client stream (GET is 405). Tools run through
 *   `call()`, so middleware, input validation and declared errors apply.
 *
 * MCP's wire format is small enough that the handler speaks it directly, so
 * `@trpc12/trpc` would keep Effect as its only dependency. The tests drive it
 * with the official `@modelcontextprotocol/sdk` client.
 */
import { Data, Effect, Option, Result } from 'effect';
import { toContract, type JsonSchema } from '@trpc12/trpc/contract';
import {
  call,
  initTrpc,
  isLazy,
  isProcedure,
  isTrpcError,
  TrpcError,
  type AnyProcedure,
  type AnyRouter,
  type AnyTrpcError,
  type inferRouterContext,
  type ProcedureType,
} from '@trpc12/trpc/server';

/** MCP's tool annotations: hints for the client, not guarantees. */
export interface ToolAnnotations {
  readonly title?: string;
  readonly readOnlyHint?: boolean;
  readonly destructiveHint?: boolean;
  readonly idempotentHint?: boolean;
  readonly openWorldHint?: boolean;
}

export interface McpToolMeta {
  /** @default the path with `.` replaced by the handler's `separator` */
  readonly name?: string;
  /** @default `route.summary` */
  readonly title?: string;
  /** What the model reads to pick the tool. @default `route.description` */
  readonly description?: string;
  readonly annotations?: ToolAnnotations;
}

export interface McpMeta {
  /** `true` or an object publishes the procedure; `false` hides it even with `include: 'all'`. */
  mcp?: McpToolMeta | boolean;
}

const mergeTool = (
  before: McpToolMeta | boolean,
  next: McpToolMeta | boolean,
): McpToolMeta | boolean =>
  typeof before === 'object' && typeof next === 'object'
    ? {
        ...before,
        ...next,
        annotations: { ...before.annotations, ...next.annotations },
      }
    : next;

/** The MCP root extension: `initTrpc().concat(mcp())`. */
export const mcp = () =>
  initTrpc<{ meta: McpMeta }>({ mergeMeta: { mcp: mergeTool } }).procedure;

type ObjectSchema = {
  readonly type: 'object';
  readonly [key: string]: unknown;
};

/** An MCP `Tool`, as `tools/list` sends it. */
export interface McpTool {
  readonly name: string;
  readonly title?: string;
  readonly description?: string;
  readonly inputSchema: ObjectSchema;
  readonly outputSchema?: ObjectSchema;
  readonly annotations: ToolAnnotations;
  readonly _meta: {
    readonly 'io.trpc/path': string;
    readonly 'io.trpc/type': ProcedureType;
    readonly 'io.trpc/errors'?: ReadonlyArray<string>;
  };
}

export interface ToolInfo {
  readonly path: string;
  readonly type: ProcedureType;
  readonly meta: object;
}

export interface DescribeToolsOptions {
  /**
   * Which procedures become tools: those with `mcp` meta, every query and
   * mutation, or a predicate. `mcp: false` always hides one.
   * @default 'meta'
   */
  readonly include?: 'meta' | 'all' | ((info: ToolInfo) => boolean);
  /**
   * Joins path segments into the default name. Clients put MCP tools in
   * front of models whose APIs allow only `[A-Za-z0-9_-]`, so not `.`.
   * @default '_'
   */
  readonly separator?: string;
}

interface Entry {
  readonly tool: McpTool;
  readonly path: string;
  readonly procedure: AnyProcedure;
  /** The input isn't an object: it travels as `{ input }`. */
  readonly wrapInput: boolean;
  /** The procedure takes no input: arguments are ignored. */
  readonly noInput: boolean;
  /** The output isn't an object: `structuredContent` is `{ result }`. */
  readonly wrapOutput: boolean;
}

const isObjectSchema = (schema: JsonSchema): boolean =>
  typeof schema === 'object' &&
  (schema['type'] === 'object' ||
    (Array.isArray(schema['allOf']) &&
      schema['allOf'].every((s: JsonSchema) => isObjectSchema(s))));

/** MCP requires `type: 'object'` at the top of tool schemas. */
const asObject = (schema: JsonSchema): ObjectSchema => ({
  ...(typeof schema === 'object' ? schema : {}),
  type: 'object',
});

const wrapped = (key: string, schema: JsonSchema): ObjectSchema => ({
  type: 'object',
  properties: { [key]: schema },
  required: [key],
});

function* procedures(
  router: object,
  prefix = '',
): Generator<[path: string, procedure: AnyProcedure]> {
  for (const [key, value] of Object.entries(router)) {
    const path = prefix + key;
    if (isProcedure(value)) yield [path, value];
    else if (isLazy(value)) {
      const loaded = value['~lazy'].loaded;
      if (!loaded) {
        throw new Error(`"${path}" is lazy: pass \`await loadRouter(router)\``);
      }
      yield* procedures(loaded, `${path}.`);
    } else if (typeof value === 'object' && value !== null) {
      yield* procedures(value, `${path}.`);
    }
  }
}

const isIncluded = (
  include: NonNullable<DescribeToolsOptions['include']>,
  info: ToolInfo,
): boolean => {
  const flag = (info.meta as McpMeta).mcp;
  if (flag === false || info.type === 'subscription') return false;
  if (include === 'all') return true;
  if (include === 'meta') return flag !== undefined;
  return include(info);
};

interface RouteLike {
  readonly summary?: string;
  readonly description?: string;
}

function describe(router: object, opts: DescribeToolsOptions = {}): Entry[] {
  const contract = toContract(router);
  const include = opts.include ?? 'meta';
  const separator = opts.separator ?? '_';
  const entries: Entry[] = [];
  const names = new Map<string, string>();
  for (const [path, procedure] of procedures(router)) {
    const def = procedure['~trpc'];
    const info: ToolInfo = { path, type: def.type, meta: def.meta };
    if (!isIncluded(include, info)) continue;
    const json = contract.procedures[path]!;
    const meta = (def.meta as McpMeta).mcp;
    const own = typeof meta === 'object' ? meta : {};
    const route = (def.meta as { route?: RouteLike }).route;
    const name = own.name ?? path.split('.').join(separator);
    const clash = names.get(name);
    if (clash) {
      throw new Error(`MCP: "${path}" and "${clash}" are both tool "${name}"`);
    }
    names.set(name, path);

    const noInput = !def.steps.some((s) => s.kind === 'input');
    const wrapInput = json.input !== undefined && !isObjectSchema(json.input);
    const wrapOutput =
      json.output !== undefined && !isObjectSchema(json.output);
    const title = own.title ?? route?.summary;
    const description = own.description ?? route?.description;
    const errors = Object.keys(json.errors ?? {});
    const tool: McpTool = {
      name,
      ...(title === undefined ? {} : { title }),
      ...(description === undefined ? {} : { description }),
      inputSchema:
        json.input === undefined
          ? { type: 'object', properties: {} }
          : wrapInput
            ? wrapped('input', json.input)
            : asObject(json.input),
      ...(json.output === undefined
        ? {}
        : {
            outputSchema: wrapOutput
              ? wrapped('result', json.output)
              : asObject(json.output),
          }),
      annotations: {
        readOnlyHint: def.type === 'query',
        ...(def.type === 'query' ? { idempotentHint: true } : {}),
        ...own.annotations,
      },
      _meta: {
        'io.trpc/path': path,
        'io.trpc/type': def.type,
        ...(errors.length ? { 'io.trpc/errors': errors } : {}),
      },
    };
    entries.push({ tool, path, procedure, wrapInput, noInput, wrapOutput });
  }
  return entries;
}

/**
 * The MCP tools a router publishes. Throws on a lazy subtree that hasn't
 * loaded, and when two procedures map to one tool name.
 */
export const describeTools = (
  router: object,
  opts?: DescribeToolsOptions,
): McpTool[] => describe(router, opts).map((e) => e.tool);

export const PROTOCOL_VERSIONS = [
  '2025-11-25',
  '2025-06-18',
  '2025-03-26',
] as const;

export interface McpHandlerOptions<
  TRouter extends AnyRouter,
> extends DescribeToolsOptions {
  readonly router: TRouter;
  readonly serverInfo?: { readonly name: string; readonly version: string };
  /** Sent in `initialize`: how the model should use the server as a whole. */
  readonly instructions?: string;
  /**
   * Builds the ctx for each JSON-RPC request. Throwing `UNAUTHORIZED` answers
   * with HTTP 401, which is what starts an MCP client's OAuth flow.
   */
  readonly createContext?: (opts: {
    request: Request;
  }) => inferRouterContext<TRouter> | Promise<inferRouterContext<TRouter>>;
  /** Hides tools per caller, in `tools/list` and `tools/call`. */
  readonly filter?: (opts: {
    tool: McpTool;
    ctx: inferRouterContext<TRouter>;
  }) => boolean;
  /**
   * Origins allowed besides the request's own. MCP servers must check
   * `Origin` against DNS rebinding.
   */
  readonly allowedOrigins?: ReadonlyArray<string>;
  /** Sent in `WWW-Authenticate` on a 401, RFC 9728's `resource_metadata`. */
  readonly resourceMetadataUrl?: string;
  /** @default false */
  readonly exposeUnexpectedErrors?: boolean;
  readonly onError?: (opts: { error: AnyTrpcError; path?: string }) => void;
}

export interface McpHandler {
  readonly fetch: (request: Request) => Promise<Response>;
  readonly tools: ReadonlyArray<McpTool>;
}

type JsonRpcId = string | number;

interface JsonRpcRequest {
  readonly jsonrpc: '2.0';
  readonly id?: JsonRpcId;
  readonly method: string;
  readonly params?: Record<string, unknown>;
}

/** JSON-RPC's error codes. */
const RPC = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
} as const;

class RpcFailure extends Data.TaggedError('RpcFailure')<{
  readonly code: number;
  readonly message: string;
}> {}

/** Answered with this HTTP response instead of a JSON-RPC one. */
class HttpFailure extends Data.TaggedError('HttpFailure')<{
  readonly response: Response;
}> {}

const json = (
  status: number,
  body: unknown,
  headers?: Record<string, string>,
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

const isRequest = (value: unknown): value is JsonRpcRequest =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  (value as { jsonrpc?: unknown }).jsonrpc === '2.0' &&
  typeof (value as { method?: unknown }).method === 'string';

const toJson = (value: unknown): unknown =>
  value === undefined ? null : JSON.parse(JSON.stringify(value));

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function createMcpHandler<TRouter extends AnyRouter>(
  opts: McpHandlerOptions<TRouter>,
): McpHandler {
  const entries = describe(opts.router, opts);
  const byName = new Map(entries.map((e) => [e.tool.name, e]));
  const serverInfo = opts.serverInfo ?? { name: 'trpc', version: '0.0.0' };
  type Ctx = inferRouterContext<TRouter>;

  const publicError = (error: AnyTrpcError) =>
    !error.defined &&
    error.code === 'INTERNAL_SERVER_ERROR' &&
    !opts.exposeUnexpectedErrors
      ? { code: error.code, message: 'Internal server error' }
      : {
          code: error.code,
          message: error.message,
          ...(error.data === undefined ? {} : { data: toJson(error.data) }),
        };

  const asTrpcError = (cause: unknown): AnyTrpcError =>
    isTrpcError(cause)
      ? cause
      : new TrpcError({
          code: 'INTERNAL_SERVER_ERROR',
          message: cause instanceof Error ? cause.message : String(cause),
          cause,
        });

  const visible = (ctx: Ctx) =>
    entries.filter((e) => !opts.filter || opts.filter({ tool: e.tool, ctx }));

  const makeContext = Effect.fn('mcp.makeContext')(function* (
    request: Request,
  ) {
    if (!opts.createContext) return {} as Ctx;
    const create = opts.createContext;
    return yield* Effect.tryPromise({
      try: async () => create({ request }),
      catch: asTrpcError,
    }).pipe(
      Effect.catch((error) =>
        Effect.fail(
          error.code === 'UNAUTHORIZED'
            ? new HttpFailure({
                response: json(401, publicError(error), {
                  'www-authenticate': opts.resourceMetadataUrl
                    ? `Bearer resource_metadata="${opts.resourceMetadataUrl}"`
                    : 'Bearer',
                }),
              })
            : new RpcFailure({
                code: RPC.internal,
                message: publicError(error).message,
              }),
        ),
      ),
    );
  });

  /**
   * A tool's failures are results with `isError`, so the model reads them and
   * can retry with other arguments; MCP keeps JSON-RPC errors for protocol
   * failures (an unknown tool).
   */
  const callTool = Effect.fn('mcp.callTool')(function* (
    request: Request,
    params: Record<string, unknown>,
  ) {
    const ctx = yield* makeContext(request);
    const name = params['name'];
    const entry = typeof name === 'string' ? byName.get(name) : undefined;
    if (!entry || (opts.filter && !opts.filter({ tool: entry.tool, ctx }))) {
      return yield* Effect.fail(
        new RpcFailure({
          code: RPC.invalidParams,
          message: `Unknown tool: ${String(name)}`,
        }),
      );
    }
    const args = isPlainObject(params['arguments']) ? params['arguments'] : {};
    const input = entry.noInput
      ? undefined
      : entry.wrapInput
        ? args['input']
        : args;
    const outcome = yield* Effect.tryPromise({
      try: () =>
        call(
          entry.procedure,
          input as never,
          {
            ctx: ctx as never,
            path: entry.path,
            signal: request.signal,
          } as never,
        ),
      catch: asTrpcError,
    }).pipe(Effect.result);
    if (Result.isFailure(outcome)) {
      const error = outcome.failure;
      opts.onError?.({ error, path: entry.path });
      const body = publicError(error);
      return {
        isError: true,
        content: [{ type: 'text', text: JSON.stringify(body) }],
        _meta: { 'io.trpc/error': body },
      };
    }
    const value = toJson(outcome.success);
    const structured = entry.wrapOutput ? { result: value } : value;
    return {
      content: [{ type: 'text', text: JSON.stringify(value) }],
      ...(entry.tool.outputSchema || isPlainObject(structured)
        ? { structuredContent: structured }
        : {}),
    };
  });

  const methods: Record<
    string,
    (
      request: Request,
      params: Record<string, unknown>,
    ) => Effect.Effect<unknown, RpcFailure | HttpFailure>
  > = {
    initialize: (_request, params) => {
      const asked = params['protocolVersion'];
      const protocolVersion = PROTOCOL_VERSIONS.find((v) => v === asked);
      return Effect.succeed({
        protocolVersion: protocolVersion ?? PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo,
        ...(opts.instructions ? { instructions: opts.instructions } : {}),
      });
    },
    ping: () => Effect.succeed({}),
    'tools/list': (request) =>
      makeContext(request).pipe(
        Effect.map((ctx) => ({ tools: visible(ctx).map((e) => e.tool) })),
      ),
    'tools/call': callTool,
  };

  const originAllowed = (request: Request) => {
    const origin = request.headers.get('origin');
    if (!origin) return true;
    return (
      origin === new URL(request.url).origin ||
      (opts.allowedOrigins ?? []).includes(origin)
    );
  };

  const readMessage = (request: Request) =>
    Effect.tryPromise({
      try: () => request.json() as Promise<unknown>,
      catch: () => new RpcFailure({ code: RPC.parse, message: 'Parse error' }),
    });

  const handle = Effect.fn('mcp.handle')(function* (request: Request) {
    if (!originAllowed(request)) {
      return json(403, { error: 'Origin not allowed' });
    }
    if (request.method !== 'POST') {
      return new Response(null, { status: 405, headers: { allow: 'POST' } });
    }
    const version = request.headers.get('mcp-protocol-version');
    if (version && !PROTOCOL_VERSIONS.some((v) => v === version)) {
      return json(400, {
        error: `Unsupported MCP-Protocol-Version: ${version}`,
      });
    }
    const message = yield* readMessage(request).pipe(Effect.option);
    if (Option.isNone(message)) {
      return json(400, {
        jsonrpc: '2.0',
        id: null,
        error: { code: RPC.parse, message: 'Parse error' },
      });
    }
    if (!isRequest(message.value)) {
      // Responses and notifications from the client need no answer.
      const isClientMessage =
        isPlainObject(message.value) && message.value['jsonrpc'] === '2.0';
      return isClientMessage
        ? new Response(null, { status: 202 })
        : json(400, {
            jsonrpc: '2.0',
            id: null,
            error: { code: RPC.invalidRequest, message: 'Invalid request' },
          });
    }
    const rpc = message.value;
    if (rpc.id === undefined) return new Response(null, { status: 202 });
    const method = methods[rpc.method];
    const outcome = yield* (
      method
        ? method(request, rpc.params ?? {})
        : Effect.fail(
            new RpcFailure({
              code: RPC.methodNotFound,
              message: `Method not found: ${rpc.method}`,
            }),
          )
    ).pipe(Effect.result);
    if (Result.isSuccess(outcome)) {
      return json(200, { jsonrpc: '2.0', id: rpc.id, result: outcome.success });
    }
    const failure = outcome.failure;
    if (failure instanceof HttpFailure) return failure.response;
    return json(200, {
      jsonrpc: '2.0',
      id: rpc.id,
      error: { code: failure.code, message: failure.message },
    });
  });

  return {
    fetch: (request) => Effect.runPromise(handle(request)),
    tools: entries.map((e) => e.tool),
  };
}
