import {
  Cause,
  Context,
  Data,
  Effect,
  Exit,
  Predicate,
  Result,
  Stream,
  type Duration,
  type Layer,
} from 'effect';
import {
  HttpEffect,
  HttpServerRequest,
  type HttpServerResponse,
  type HttpMiddleware,
} from 'effect/http';
import { flattenRoutes } from '../internal/describe.ts';
import { statusOf, TrpcError, type AnyTrpcError } from '../internal/error.ts';
import type { MaybePromise } from '../internal/types.ts';
import { toOpenApiError } from '../openapi/rest/index.ts';
import {
  createResponseHandle,
  normalizeCause,
  unexpectedError,
} from '../server/execution/index.ts';
import {
  createHandlerCore,
  CurrentPlatform,
  fromWebResponse,
  readBytes,
  textWebResponse,
  type ContextOption,
  type CreateContextOpts,
  type LayerOption,
  type OnErrorOpts,
  type PlatformArgs,
  type RuntimeOption,
} from '../server/handler/index.ts';
import type {
  AnyRouter,
  inferRouterContext,
  RootRouterCheck,
  inferRouterServices,
} from '../server/procedures/index.ts';
import {
  describeEntries,
  type DescribeToolsOptions,
  type McpTool,
  type ToolEntry,
} from './tools.ts';

/** The protocol versions the handler speaks, newest first. */
const PROTOCOL_VERSIONS: ReadonlyArray<string> = [
  '2025-11-25',
  '2025-06-18',
  '2025-03-26',
];

/**
 * Options shared by every MCP handler.
 * @since 0.1.0
 * @stability experimental
 */
export interface BaseMcpHandlerOptions<
  TRouter extends AnyRouter,
> extends DescribeToolsOptions {
  router: TRouter & RootRouterCheck<TRouter>;
  /** Sent in `initialize`. @default { name: 'trpc', version: '0.0.0' } */
  serverInfo?: {
    readonly name: string;
    readonly version: string;
    readonly title?: string;
  };
  /** Sent in `initialize`: how the model should use the server as a whole. */
  instructions?: string;
  /**
   * Hides tools per caller, in `tools/list` and `tools/call`, with the ctx
   * `createContext` made for the request.
   */
  filter?: (opts: {
    readonly tool: McpTool;
    readonly ctx: inferRouterContext<TRouter>;
  }) => boolean;
  /**
   * Origins allowed besides the request's own. A request from any other
   * `Origin` is refused with a 403, as MCP requires against DNS rebinding.
   */
  allowedOrigins?: ReadonlyArray<string>;
  /**
   * Your protected resource metadata (RFC 9728), sent in `WWW-Authenticate`
   * when `createContext` throws `UNAUTHORIZED`: what an MCP client starts
   * its OAuth sign-in from.
   */
  resourceMetadataUrl?: string;
  /**
   * Max request body size, in bytes.
   * @default 1_048_576
   */
  maxBodySize?: number;
  /**
   * Send the real message of unexpected errors to the model.
   * @default true only when `NODE_ENV` is `development` or `test`
   */
  exposeUnexpectedErrors?: boolean;
  /** Called for every error, with the original cause. */
  onError?: (opts: OnErrorOpts) => void;
  /** Effect HTTP middleware around the handler, outermost first, e.g. `cors()`. */
  middleware?: ReadonlyArray<HttpMiddleware.HttpMiddleware>;
  /**
   * How long `dispose()` waits for the requests in flight before it
   * interrupts them.
   * @default '10 seconds'
   */
  drainTimeout?: Duration.Input;
}

/**
 * The options of {@link experimental_createMcpHandler}.
 * @since 0.1.0
 * @stability experimental
 */
export type McpHandlerOptions<
  TRouter extends AnyRouter,
  TPlatform = undefined,
> = BaseMcpHandlerOptions<TRouter> &
  ContextOption<inferRouterContext<TRouter>, TPlatform> &
  (
    | LayerOption<inferRouterServices<TRouter>>
    | RuntimeOption<inferRouterServices<TRouter>>
  );

/**
 * A web-standard MCP server for a router's tools.
 * @since 0.1.0
 * @stability experimental
 */
export interface McpHandler<TPlatform = undefined> {
  /** Handles one HTTP request to the MCP endpoint. `platform` reaches `createContext`. */
  readonly fetch: (
    request: Request,
    ...platform: PlatformArgs<TPlatform>
  ) => Promise<Response>;
  /**
   * Waits up to `drainTimeout` for the requests in flight, then releases
   * the `layer`'s resources; a `runtime` you passed is yours to dispose.
   */
  dispose(): Promise<void>;
  /** `dispose()`, for `await using`. */
  [Symbol.asyncDispose](): Promise<void>;
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

const RpcFailureBase: new (args: {
  readonly code: number;
  readonly message: string;
}) => Cause.YieldableError & {
  readonly _tag: 'RpcFailure';
  readonly code: number;
} = /* @__PURE__ */ Data.TaggedError('RpcFailure');

/** Answered as a JSON-RPC error. */
class RpcFailure extends RpcFailureBase {}

const HttpFailureBase: new (args: {
  readonly response: Response;
}) => Cause.YieldableError & {
  readonly _tag: 'HttpFailure';
  readonly response: Response;
} = /* @__PURE__ */ Data.TaggedError('HttpFailure');

/** Answered with this HTTP response instead of a JSON-RPC one. */
class HttpFailure extends HttpFailureBase {}

const json = (
  status: number,
  body: unknown,
  headers?: Record<string, string>,
) =>
  textWebResponse(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

const rpcError = (status: number, code: number, message: string) =>
  json(status, { jsonrpc: '2.0', id: null, error: { code, message } });

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isRequest = (value: unknown): value is JsonRpcRequest =>
  isPlainObject(value) &&
  value['jsonrpc'] === '2.0' &&
  typeof value['method'] === 'string';

/** What `JSON.stringify` makes of `value`: dates as strings, `undefined` dropped. */
const toJson = (value: unknown): unknown =>
  value === undefined ? undefined : JSON.parse(JSON.stringify(value));

const isStreamed = (value: unknown) =>
  Stream.isStream(value) ||
  (Predicate.hasProperty(value, Symbol.asyncIterator) &&
    !(value instanceof ReadableStream));

const decoder = /* @__PURE__ */ new TextDecoder();

/**
 * Serves a router's procedures as MCP tools, over MCP's Streamable HTTP
 * transport, statelessly: one JSON-RPC message per POST, answered with
 * JSON. No sessions and no server-to-client stream (a GET is 405), so it
 * scales and deploys like any fetch handler. It speaks `initialize`, `ping`,
 * `tools/list` and `tools/call`, and needs no MCP SDK.
 *
 * A call runs the procedure as the RPC handler does, with `createContext`,
 * middleware, validation, the `layer`, spans and `onError`. A procedure's
 * failure is a tool result with `isError: true` and the error's JSON, which
 * the model reads and can retry from; unexpected errors are masked as over
 * RPC.
 *
 * @example
 * ```ts
 * const t = initTrpc<{ ctx: Context }>().concat(experimental_mcp());
 * const appRouter = t.router({
 *   post: {
 *     byId: t.procedure
 *       .meta({ mcp: { description: 'Read one blog post by its id.' } })
 *       .input(z.object({ id: z.string() }))
 *       .query(({ input }) => db.post.find(input.id)),
 *   },
 * });
 * export const mcp = experimental_createMcpHandler({
 *   router: appRouter,
 *   serverInfo: { name: 'blog', version: '1.0.0' },
 *   createContext,
 * });
 * // serve `mcp.fetch` at /mcp: tools/list → [post_byId]
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export function experimental_createMcpHandler<
  TRouter extends AnyRouter,
  TPlatform = undefined,
>(opts: McpHandlerOptions<TRouter, TPlatform>): McpHandler<TPlatform> {
  const base = createHandlerCore(
    opts as typeof opts & {
      createContext?: (o: CreateContextOpts<any>) => MaybePromise<object>;
      layer?: Layer.Layer<any, any, never>;
    },
  );
  const maxBodySize = opts.maxBodySize ?? 1_048_576;
  const serverInfo = opts.serverInfo ?? { name: 'trpc', version: '0.0.0' };
  type Ctx = inferRouterContext<TRouter>;

  const index = (list: ToolEntry[]) =>
    new Map(list.map((e) => [e.tool.name, e]));
  /** Built at creation, so a name clash throws there, unless lazy subtrees wait. */
  let tools =
    flattenRoutes(opts.router).lazies.length === 0
      ? index(describeEntries(opts.router, opts))
      : undefined;
  const loadLazies: Effect.Effect<void> = Effect.suspend(() => {
    const lazies = flattenRoutes(opts.router).lazies;
    if (lazies.length === 0) return Effect.void;
    return Effect.forEach(lazies, (l) => l.lazy['~lazy'].loadEffect, {
      concurrency: 'unbounded',
      discard: true,
    }).pipe(Effect.andThen(loadLazies));
  });
  const ready: Effect.Effect<Map<string, ToolEntry>> = Effect.suspend(() =>
    tools
      ? Effect.succeed(tools)
      : Effect.andThen(
          loadLazies,
          Effect.sync(() => {
            tools = index(describeEntries(opts.router, opts));
            return tools;
          }),
        ),
  );

  const visible = (entry: ToolEntry, ctx: Ctx) =>
    !opts.filter || opts.filter({ tool: entry.tool, ctx });

  const publicBody = (err: AnyTrpcError) =>
    toJson(toOpenApiError(base.publicError(err)));

  const makeContext = (
    http: HttpServerRequest.HttpServerRequest,
    platform: unknown,
    signal: AbortSignal,
    entry?: ToolEntry,
  ): Effect.Effect<Ctx, HttpFailure | RpcFailure> =>
    base
      .makeContext({
        request: http,
        platform,
        calls: entry
          ? [{ path: entry.path, type: entry.procedure['~trpc'].type }]
          : [],
        signal,
      })
      .pipe(
        Effect.map((ctx) => ctx as Ctx),
        Effect.catch((err): Effect.Effect<never, HttpFailure | RpcFailure> => {
          base.report(err, http, entry?.path);
          if (err.code === 'UNAUTHORIZED') {
            const challenge = opts.resourceMetadataUrl
              ? `Bearer resource_metadata="${opts.resourceMetadataUrl}"`
              : 'Bearer';
            return Effect.fail(
              new HttpFailure({
                response: json(401, publicBody(err), {
                  'www-authenticate': challenge,
                }),
              }),
            );
          }
          return Effect.fail(
            new RpcFailure({
              code: RPC.internal,
              message: base.publicError(err).message,
            }),
          );
        }),
      );

  const unknownTool = (name: unknown) =>
    new RpcFailure({
      code: RPC.invalidParams,
      message: `Unknown tool: ${String(name)}`,
    });

  /**
   * A procedure's failures are results with `isError`, so the model reads
   * them and can retry; protocol failures (an unknown tool) are JSON-RPC
   * errors, as MCP specifies.
   */
  const callTool = (
    http: HttpServerRequest.HttpServerRequest,
    platform: unknown,
    signal: AbortSignal,
    params: Record<string, unknown>,
  ) =>
    Effect.gen(function* () {
      const name = params['name'];
      const entry =
        typeof name === 'string' ? (yield* ready).get(name) : undefined;
      if (!entry) return yield* Effect.fail(unknownTool(name));
      const ctx = yield* makeContext(http, platform, signal, entry);
      if (!visible(entry, ctx)) return yield* Effect.fail(unknownTool(name));
      const args = isPlainObject(params['arguments'])
        ? params['arguments']
        : {};
      let input: unknown = args;
      if (entry.noInput) input = undefined;
      else if (entry.wrapInput) input = args['input'];
      const exit = yield* base.run({
        request: http,
        procedure: entry.procedure,
        path: entry.path,
        ctx: ctx as object,
        input,
        signal,
        response: createResponseHandle(),
      });
      const failed = (err: AnyTrpcError) => {
        base.report(err, http, entry.path, entry.procedure['~trpc'].type);
        const body = publicBody(err);
        return {
          isError: true,
          content: [{ type: 'text', text: JSON.stringify(body) }],
          _meta: { 'io.trpc/error': body },
        };
      };
      if (Exit.isFailure(exit)) return failed(normalizeCause(exit.cause));
      if (isStreamed(exit.value)) {
        return failed(
          new TrpcError.BadRequest({
            tag: 'UnsupportedResponse',
            message: 'A streamed output is not a tool result',
          }),
        );
      }
      const value = toJson(exit.value);
      let structured: unknown = value;
      if (entry.wrapOutput) {
        structured = value === undefined ? {} : { result: value };
      }
      let content: Array<{ type: 'text'; text: string }> = [];
      if (typeof value === 'string') content = [{ type: 'text', text: value }];
      else if (value !== undefined) {
        content = [{ type: 'text', text: JSON.stringify(value) }];
      }
      return {
        content,
        ...(isPlainObject(structured) ? { structuredContent: structured } : {}),
      };
    });

  type Method = (
    http: HttpServerRequest.HttpServerRequest,
    platform: unknown,
    signal: AbortSignal,
    params: Record<string, unknown>,
  ) => Effect.Effect<unknown, RpcFailure | HttpFailure>;

  const methods: Record<string, Method> = {
    initialize: (_http, _platform, _signal, params) => {
      const asked = params['protocolVersion'];
      return Effect.succeed({
        protocolVersion:
          PROTOCOL_VERSIONS.find((v) => v === asked) ?? PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo,
        ...(opts.instructions ? { instructions: opts.instructions } : {}),
      });
    },
    ping: () => Effect.succeed({}),
    'tools/list': (http, platform, signal) =>
      Effect.gen(function* () {
        const all = yield* ready;
        const ctx = yield* makeContext(http, platform, signal);
        return {
          tools: [...all.values()]
            .filter((e) => visible(e, ctx))
            .map((e) => e.tool),
        };
      }),
    'tools/call': callTool,
  };

  const originAllowed = (request: Request) => {
    const origin = request.headers.get('origin');
    return (
      !origin ||
      origin === new URL(request.url).origin ||
      (opts.allowedOrigins ?? []).includes(origin)
    );
  };

  const readMessage = (http: HttpServerRequest.HttpServerRequest) =>
    readBytes(http, maxBodySize).pipe(
      Effect.mapError(
        (err) =>
          new HttpFailure({
            response: rpcError(statusOf(err), RPC.invalidRequest, err.message),
          }),
      ),
      Effect.flatMap((bytes) =>
        Effect.try({
          try: () => JSON.parse(decoder.decode(bytes)) as unknown,
          catch: () =>
            new HttpFailure({
              response: rpcError(400, RPC.parse, 'Parse error'),
            }),
        }),
      ),
    );

  const handle = (
    http: HttpServerRequest.HttpServerRequest,
    request: Request,
    platform: unknown,
  ): Effect.Effect<Response, HttpFailure> =>
    Effect.gen(function* () {
      if (!originAllowed(request)) {
        return json(403, { error: 'Origin not allowed' });
      }
      if (request.method !== 'POST') {
        return new Response(null, { status: 405, headers: { allow: 'POST' } });
      }
      const version = request.headers.get('mcp-protocol-version');
      if (version && !PROTOCOL_VERSIONS.includes(version)) {
        return json(400, {
          error: `Unsupported MCP-Protocol-Version: ${version}`,
        });
      }
      const message = yield* readMessage(http);
      if (!isRequest(message)) {
        // Responses and notifications from the client need no answer.
        return isPlainObject(message) && message['jsonrpc'] === '2.0'
          ? new Response(null, { status: 202 })
          : rpcError(400, RPC.invalidRequest, 'Invalid request');
      }
      if (message.id === undefined) return new Response(null, { status: 202 });
      const method = Object.hasOwn(methods, message.method)
        ? methods[message.method]
        : undefined;
      const outcome = yield* (
        method
          ? method(http, platform, request.signal, message.params ?? {})
          : Effect.fail(
              new RpcFailure({
                code: RPC.methodNotFound,
                message: `Method not found: ${message.method}`,
              }),
            )
      ).pipe(Effect.result);
      if (Result.isSuccess(outcome)) {
        return json(200, {
          jsonrpc: '2.0',
          id: message.id,
          result: outcome.success,
        });
      }
      if (outcome.failure instanceof HttpFailure) {
        return yield* Effect.fail(outcome.failure);
      }
      return json(200, {
        jsonrpc: '2.0',
        id: message.id,
        error: { code: outcome.failure.code, message: outcome.failure.message },
      });
    });

  const app = Effect.gen(function* () {
    const http = yield* HttpServerRequest.HttpServerRequest;
    // `webHandler` is the only way in, so the source is a web Request.
    const request = http.source as Request;
    const platform = yield* CurrentPlatform;
    const response = yield* handle(http, request, platform).pipe(
      Effect.catchCause((cause) => {
        if (Cause.hasInterruptsOnly(cause)) return Effect.failCause(cause);
        const squashed = Cause.squash(cause);
        if (squashed instanceof HttpFailure) {
          return Effect.succeed(squashed.response);
        }
        const err = unexpectedError(squashed);
        base.report(err, http);
        return Effect.succeed(
          rpcError(500, RPC.internal, base.publicError(err).message),
        );
      }),
    );
    return fromWebResponse(response);
  });
  const served = (opts.middleware ?? []).reduceRight<
    Effect.Effect<HttpServerResponse.HttpServerResponse, any, any>
  >((inner, m) => m(inner), app);
  // `toWebHandler` runs the app uninterruptibly, as servers do; `dispose()`
  // and an aborted request interrupt the call.
  const webHandler = HttpEffect.toWebHandler(
    base.request(Effect.interruptible(served)) as never,
  );

  const handler: McpHandler<unknown> = {
    fetch: (request, platform) =>
      webHandler(
        request,
        platform === undefined
          ? undefined
          : (Context.make(CurrentPlatform, platform) as Context.Context<never>),
      ),
    dispose: base.dispose,
    [Symbol.asyncDispose]: base.dispose,
  };
  return handler as McpHandler<TPlatform>;
}
