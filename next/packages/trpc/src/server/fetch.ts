import {
  Cause,
  Context,
  Effect,
  Exit,
  Option,
  Queue,
  Stream,
  Tracer,
  type Layer,
} from 'effect';
import {
  HttpServerRequest,
  HttpServerResponse,
  HttpTraceContext,
  type HttpMiddleware,
  type HttpRouter,
} from 'effect/http';
import {
  isTrpcError,
  statusOf,
  toWireError,
  TrpcError,
  type AnyTrpcError,
} from '../internal/error.ts';
import {
  blobHeaders,
  CONTENT_TYPE,
  fromInputSearch,
  HEADER,
  isJsonContentType,
  isMultipartContentType,
  PROTOCOL_VERSION,
  SSE_EVENT,
  type BatchCall,
  type BatchLine,
} from '../internal/protocol.ts';
import type { MaybePromise, ProcedureType } from '../internal/types.ts';
import { jsonSerializer, type AnySerializer } from '../serializer/index.ts';
import { accepts, encodeRecord } from '../internal/frames.ts';
import type { Chunk, Frame } from '../serializer/stream.ts';
import {
  consumedError,
  parsedBody,
  readBytes as readRequestBytes,
  responseOptions,
} from './body.ts';
import { createHandlerCore } from './core.ts';
import {
  createResponseHandle,
  normalizeCause,
  unexpectedError,
} from './execute.ts';
import { emitEvents } from './events.ts';
import { frameSinks, type FrameSink } from './frame-sink.ts';
import type { AnyProcedure } from './procedure.ts';
import {
  resolveProcedure,
  type AnyRouter,
  type inferRouterContext,
  type inferRouterServices,
} from './router.ts';
import { httpParts } from './routes.ts';
import {
  messagePortConnection,
  serveConnection,
  socketCores,
  webSocketConnection,
  type MessagePortLike,
  type SocketCore,
  type Transport,
  type WebSocketLike,
} from './socket.ts';

const encoder = new TextEncoder();

/**
 * What `createContext` receives.
 * @since 0.1.0
 * @stability stable
 */
export interface CreateContextOpts<TPlatform = undefined> {
  /**
   * The HTTP request, or the upgrade request of a WebSocket, as Effect's
   * `HttpServerRequest`: `request.headers` is a record of lowercase names
   * (`request.headers.cookie`), and on fetch runtimes `request.source` is
   * the web `Request`. For a MessagePort, the `request` passed to
   * `handler.messagePort()`, or a placeholder `http://localhost/` request.
   */
  readonly request: HttpServerRequest.HttpServerRequest;
  /**
   * What the runtime passed `handler.fetch(request, platform)` or
   * `handler.websocket(socket, { request, platform })`: Workers' `env` and
   * `ctx`, say. `undefined` under `serve()`, Node and Bun.
   */
  readonly platform: TPlatform;
  readonly info: {
    /** Every call in the request: one, or several for a batch. */
    readonly calls: ReadonlyArray<{ path: string; type: ProcedureType }>;
    readonly signal: AbortSignal;
    readonly transport: Transport;
    /** What a WebSocket or MessagePort client sent as `connectionParams`. */
    readonly connectionParams: Record<string, unknown> | undefined;
  };
}

/**
 * What `onError` receives. `error.cause` holds the original thrown value.
 * @since 0.1.0
 * @stability stable
 */
export interface OnErrorOpts {
  readonly error: AnyTrpcError;
  readonly path: string | undefined;
  readonly type: ProcedureType | undefined;
  readonly request: HttpServerRequest.HttpServerRequest;
}

/**
 * `createContext`, required when the router's procedures need ctx.
 * @since 0.1.0
 * @stability stable
 */
export type ContextOption<TCtx, TPlatform = undefined> = {} extends TCtx
  ? {
      /** Runs once per request (once per batch). */
      createContext?: (
        opts: CreateContextOpts<TPlatform>,
      ) => MaybePromise<TCtx>;
    }
  : {
      /** Runs once per request (once per batch). */
      createContext: (opts: CreateContextOpts<TPlatform>) => MaybePromise<TCtx>;
    };

/**
 * The platform argument `fetch()` takes: none without a platform type (so
 * `handler.fetch` fits Next's route handler type), optional when the type
 * allows `undefined`, required otherwise.
 * @since 0.1.0
 * @stability stable
 */
export type PlatformArgs<TPlatform> = [TPlatform] extends [undefined]
  ? []
  : undefined extends TPlatform
    ? [platform?: TPlatform]
    : [platform: TPlatform];

/**
 * The `platform` field of `websocket()` and `messagePort()` options.
 * @since 0.1.0
 * @stability stable
 */
export type PlatformField<TPlatform> = undefined extends TPlatform
  ? { platform?: TPlatform }
  : { platform: TPlatform };

/**
 * `layer`, required when the router's procedures need Effect services.
 * @since 0.1.0
 * @stability stable
 */
export type LayerOption<TServices> = [TServices] extends [never]
  ? { layer?: Layer.Layer<never, any, never> }
  : {
      /** Provides the Effect services the router's procedures need (02 S1). */
      layer: Layer.Layer<TServices, any, never>;
    };

/**
 * The handler's `serializer` option.
 * @since 0.1.0
 * @stability stable
 */
export interface SerializerOption {
  /**
   * The wire format. Links must use the same one; a link with another fails
   * with an error naming both (`trpc-serializer` header). Client types
   * follow the link's serializer.
   * @default jsonSerializer
   */
  serializer?: AnySerializer | undefined;
}

/**
 * Options shared by every handler.
 * @since 0.1.0
 * @stability stable
 */
export interface BaseHandlerOptions<TRouter extends AnyRouter> {
  router: TRouter;
  /**
   * The path prefix procedures are served under.
   * @default '/trpc'
   */
  endpoint?: string;
  /**
   * Accept batched requests (opt-in, 10).
   * @default false
   */
  batch?: boolean | { maxItems?: number };
  /**
   * Max request body size, in bytes.
   * @default 1_048_576
   */
  maxBodySize?: number;
  /**
   * Send the real message of unexpected errors to the client.
   * @default true only when `NODE_ENV` is `development` or `test`
   */
  exposeUnexpectedErrors?: boolean;
  /** Called for every error, with the original cause. */
  onError?: (opts: OnErrorOpts) => void;
  /**
   * Effect HTTP middleware around the handler, outermost first: CORS,
   * logging, rate limits (13 C). `@trpc12/trpc/http`'s `cors()` also checks the
   * origin of WebSocket upgrades.
   *
   * @example
   * ```ts
   * createFetchHandler({
   *   router,
   *   middleware: [cors({ allowedOrigins: ['https://app.example.com'] }), HttpMiddleware.logger],
   * });
   * ```
   */
  middleware?: ReadonlyArray<HttpMiddleware.HttpMiddleware>;
  sse?: {
    /**
     * Send a comment line this often while a subscription is quiet, so
     * proxies don't close it as idle. `false` sends none.
     * @default 15_000
     */
    pingMs?: number | false;
  };
  websocket?: {
    /**
     * Close a WebSocket that sends nothing, `wsLink`'s pings included, for
     * this long, and stop its subscriptions. The close code is 1001, so a
     * live client reconnects. `false` keeps silent sockets open.
     * @default 60_000
     */
    idleTimeoutMs?: number | false;
  };
}

/**
 * The options of {@link createFetchHandler}.
 * @since 0.1.0
 * @stability stable
 */
export type FetchHandlerOptions<
  TRouter extends AnyRouter,
  TPlatform = undefined,
> = BaseHandlerOptions<TRouter> &
  ContextOption<inferRouterContext<TRouter>, TPlatform> &
  LayerOption<inferRouterServices<TRouter>> &
  SerializerOption;

/**
 * A web-standard request handler.
 * @since 0.1.0
 * @stability stable
 */
export interface FetchHandler<TPlatform = undefined> {
  /**
   * Handles one HTTP request. `platform` reaches `createContext`.
   *
   * @example
   * ```ts
   * // Cloudflare Workers
   * export default {
   *   fetch: (request, env, ctx) => handler.fetch(request, { env, ctx }),
   * } satisfies ExportedHandler<Env>;
   * ```
   */
  readonly fetch: (
    request: Request,
    ...platform: PlatformArgs<TPlatform>
  ) => Promise<Response>;
  /**
   * Serves calls over an accepted WebSocket (10, 12). `request` is the
   * upgrade request; `createContext` receives it.
   *
   * @example
   * ```ts
   * // Deno
   * Deno.serve((request) => {
   *   if (request.headers.get('upgrade') !== 'websocket') return handler.fetch(request);
   *   const { socket, response } = Deno.upgradeWebSocket(request);
   *   handler.websocket(socket, { request });
   *   return response;
   * });
   * ```
   */
  websocket(
    socket: WebSocketLike,
    opts: { request: Request } & PlatformField<TPlatform>,
  ): void;
  /**
   * Serves calls over a `MessagePort`, `Worker` or `worker_threads` port.
   *
   * @example
   * ```ts
   * // in a worker
   * handler.messagePort(parentPort);
   * ```
   */
  messagePort(
    port: MessagePortLike,
    ...opts: undefined extends TPlatform
      ? [opts?: { request?: Request; platform?: TPlatform }]
      : [opts: { request?: Request; platform: TPlatform }]
  ): void;
  /**
   * The handler as `effect/http` routes for its endpoint and the paths
   * under it, WebSocket upgrades included. Merge them with your own routes
   * and serve them with `HttpRouter.serve`.
   *
   * @example
   * ```ts
   * const app = Layer.mergeAll(
   *   handler.routes,
   *   HttpRouter.add('GET', '/health', HttpServerResponse.text('ok')),
   * );
   * HttpRouter.serve(app).pipe(
   *   Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 })),
   *   Layer.launch,
   *   NodeRuntime.runMain,
   * );
   * ```
   */
  readonly routes: Layer.Layer<never, never, HttpRouter.HttpRouter>;
  /** Releases the `layer`'s resources. */
  dispose(): Promise<void>;
}

const decoder = new TextDecoder();

const protocolError = (code: string, message: string) =>
  new TrpcError({ code, message });

/** The `platform` of the request being handled. @internal */
export const CurrentPlatform: Context.Reference<unknown> =
  Context.Reference<unknown>('@trpc12/trpc/CurrentPlatform', {
    defaultValue: () => undefined,
  });

/** The `effect/http` app behind each fetch handler, for `@trpc12/trpc/http`. @internal */
export const httpApps: WeakMap<
  object,
  {
    readonly app: Effect.Effect<
      HttpServerResponse.HttpServerResponse,
      never,
      HttpServerRequest.HttpServerRequest
    >;
    readonly middleware: ReadonlyArray<HttpMiddleware.HttpMiddleware>;
  }
> = new WeakMap();

interface CallResult {
  status: number;
  body: unknown;
  chunks?: Stream.Stream<Chunk, unknown> | undefined;
  headers?: Headers | undefined;
  /** A root `File` or `Blob` output, sent as the body of an unbatched call. */
  blob?: Blob | undefined;
  /** What the procedure returned instead of a value, sent as is. */
  response?: HttpServerResponse.HttpServerResponse | undefined;
  /** Frames `experimental_durable()` keeps, sent instead of `body` and `chunks`. */
  frames?: Stream.Stream<Frame> | undefined;
}

/**
 * A request URL's pathname and search, as `new URL(url, base)` gives them.
 * Node's `/path?query` form is split by hand; anything that `URL` would
 * resolve differently (dot segments, `//`, backslashes, absolute URLs) goes
 * through `URL`.
 */
const splitUrl = (url: string): { pathname: string; search: string } => {
  if (
    url.charCodeAt(0) === 47 &&
    url.charCodeAt(1) !== 47 &&
    !url.includes('/.') &&
    !url.includes('\\') &&
    !url.includes('#')
  ) {
    const q = url.indexOf('?');
    return q === -1
      ? { pathname: url, search: '' }
      : { pathname: url.slice(0, q), search: url.slice(q) };
  }
  const parsed = new URL(url, 'http://localhost');
  return { pathname: parsed.pathname, search: parsed.search };
};

/**
 * The span an HTTP call's span is a child of: the request's span (Effect's
 * HTTP tracer middleware makes one from `traceparent`), else the trace
 * context in the request's headers.
 * @internal
 */
export const parentSpan = (
  request: HttpServerRequest.HttpServerRequest,
): Effect.Effect<Tracer.AnySpan | undefined> =>
  Effect.withFiber((fiber) =>
    Effect.succeed(parentSpanIn(request, fiber.context)),
  );

/** {@link parentSpan} in the fiber's `context`. */
const parentSpanIn = (
  request: HttpServerRequest.HttpServerRequest,
  context: Context.Context<never>,
): Tracer.AnySpan | undefined =>
  Context.getOrUndefined(context, Tracer.ParentSpan) ??
  Option.getOrUndefined(HttpTraceContext.fromHeaders(request.headers));

/** `Effect.flatMap`, without a step when `effect` has already succeeded. */
const chain = <A, B, E, E2, R, R2>(
  effect: Effect.Effect<A, E, R>,
  f: (a: A) => Effect.Effect<B, E2, R2>,
): Effect.Effect<B, E | E2, R | R2> =>
  Exit.isExit(effect) && Exit.isSuccess(effect)
    ? f(effect.value as A)
    : Effect.flatMap(effect, f);

/**
 * Serves a router over the web-standard `fetch` interface (12 P-A). Works on
 * any runtime with `Request`/`Response`; `@trpc12/trpc/http` serves it with
 * Effect's `HttpServer` on Node, Bun and the rest. Underneath it's an
 * `effect/http` app: `middleware` wraps it, and `createContext` gets the
 * `HttpServerRequest`.
 *
 * @example
 * ```ts
 * const handler = createFetchHandler({
 *   router: appRouter,
 *   createContext: ({ request }) => ({ user: getUser(request.headers.cookie) }),
 *   layer: PostRepo.Live, // Effect services, when procedures need any
 * });
 * export default { fetch: handler.fetch };
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function createFetchHandler<
  TRouter extends AnyRouter,
  TPlatform = undefined,
>(opts: FetchHandlerOptions<TRouter, TPlatform>): FetchHandler<TPlatform> {
  const { router } = opts;
  const base = createHandlerCore(
    opts as typeof opts & {
      createContext?: (o: CreateContextOpts<any>) => MaybePromise<object>;
      layer?: Layer.Layer<any, any, never>;
    },
  );
  const { publicError, report } = base;
  const serializer: AnySerializer = opts.serializer ?? jsonSerializer;
  const endpoint = `/${(opts.endpoint ?? '/trpc').replace(/^\/+|\/+$/g, '')}`;
  /** Procedure paths follow this. */
  const under = endpoint === '/' ? '/' : `${endpoint}/`;
  const maxBodySize = opts.maxBodySize ?? 1_048_576;
  const ssePingMs = opts.sse?.pingMs ?? 15_000;
  const batch =
    opts.batch === true
      ? { maxItems: 20 }
      : opts.batch
        ? { maxItems: opts.batch.maxItems ?? 20 }
        : undefined;

  const wire = (err: AnyTrpcError) =>
    serializer.serialize(toWireError(publicError(err)));
  const coerceError =
    (
      request: HttpServerRequest.HttpServerRequest,
      path: string,
      type?: ProcedureType,
    ) =>
    (cause: unknown) => {
      const err = isTrpcError(cause) ? cause : unexpectedError(cause);
      report(err, request, path, type);
      return toWireError(publicError(err));
    };

  const respond = (
    status: number,
    body: string | Blob | Stream.Stream<Uint8Array>,
    contentType: string,
    extra?: Record<string, string>,
    set?: Headers,
  ): HttpServerResponse.HttpServerResponse => {
    const fromSet = responseOptions(set);
    const options: HttpServerResponse.Options.WithContentType = {
      status,
      contentType,
      headers: {
        ...fromSet.headers,
        [HEADER.version]: PROTOCOL_VERSION,
        [HEADER.serializer]: serializer.name,
        ...extra,
      },
      cookies: fromSet.cookies,
    };
    if (typeof body === 'string') return HttpServerResponse.text(body, options);
    if (body instanceof Blob) {
      return HttpServerResponse.stream(
        Stream.fromReadableStream({
          evaluate: () => body.stream(),
          onError: (cause) => cause,
        }) as Stream.Stream<Uint8Array>,
        { ...options, contentLength: body.size },
      );
    }
    return HttpServerResponse.stream(body, options);
  };

  const errorResponse = (err: AnyTrpcError) =>
    respond(statusOf(err), JSON.stringify(wire(err)), CONTENT_TYPE.json);

  const readBytes = (request: HttpServerRequest.HttpServerRequest) =>
    readRequestBytes(request, maxBodySize);

  const parseJson = (text: string) =>
    Effect.try({
      try: () => (text === '' ? undefined : (JSON.parse(text) as unknown)),
      catch: (cause) =>
        new TrpcError({ code: 'PARSE_ERROR', message: 'Invalid JSON', cause }),
    });

  const readBody = (request: HttpServerRequest.HttpServerRequest) =>
    Effect.gen(function* () {
      if (parsedBody(request) === 'consumed') {
        return yield* Effect.fail(consumedError());
      }
      if (!isJsonContentType(request.headers['content-type'] ?? null)) {
        return yield* Effect.fail(
          protocolError(
            'UNSUPPORTED_MEDIA_TYPE',
            'POST requests must have content-type: application/json',
          ),
        );
      }
      const bytes = yield* readBytes(request);
      return yield* parseJson(decoder.decode(bytes));
    });

  const deserializeInput = (value: unknown, parts?: ReadonlyArray<Blob>) => {
    if (value === undefined) return undefined;
    try {
      return serializer.deserialize(value as never, { input: true, parts });
    } catch (cause) {
      throw new TrpcError({
        code: 'PARSE_ERROR',
        message: cause instanceof Error ? cause.message : 'Invalid input',
        cause,
      });
    }
  };
  const deserialize = (value: unknown, parts?: ReadonlyArray<Blob>) =>
    Effect.try({
      try: () => deserializeInput(value, parts),
      catch: (cause) => cause as AnyTrpcError,
    });

  /** An `input` field with the serialized JSON, and parts `0`, `1`, … for its blobs. */
  const readMultipart = (request: HttpServerRequest.HttpServerRequest) =>
    Effect.gen(function* () {
      const bytes = yield* readBytes(request);
      const form = yield* Effect.tryPromise({
        try: () =>
          new globalThis.Response(bytes as BodyInit, {
            // Only multipart requests get here.
            headers: { 'content-type': request.headers['content-type']! },
          }).formData(),
        catch: (cause) =>
          new TrpcError({
            code: 'PARSE_ERROR',
            message: 'Invalid multipart body',
            cause,
          }),
      });
      const field = form.get('input');
      if (typeof field !== 'string') {
        return yield* Effect.fail(
          protocolError(
            'BAD_REQUEST',
            'A multipart body needs an "input" field',
          ),
        );
      }
      const value = yield* parseJson(field);
      const parts: Blob[] = [];
      for (;;) {
        const part = form.get(String(parts.length));
        if (!(part instanceof Blob)) break;
        parts.push(part);
      }
      return yield* deserialize(value, parts);
    });

  const noInput = Effect.succeed(undefined);
  const readInput = (
    request: HttpServerRequest.HttpServerRequest,
    search: string,
  ): Effect.Effect<unknown, AnyTrpcError> => {
    if (request.method === 'GET') {
      if (search.length <= 1) return noInput;
      try {
        const value = fromInputSearch(search);
        return value === undefined
          ? noInput
          : Effect.succeed(serializer.deserialize(value, { input: true }));
      } catch (cause) {
        return Effect.fail(
          new TrpcError({
            code: 'PARSE_ERROR',
            message: cause instanceof Error ? cause.message : 'Invalid input',
            cause,
          }),
        );
      }
    }
    if (isMultipartContentType(request.headers['content-type'] ?? null)) {
      // A cross-site form can send multipart without a preflight; it can't add a header.
      if (request.headers[HEADER.version] === undefined) {
        return Effect.fail(
          protocolError(
            'UNSUPPORTED_MEDIA_TYPE',
            `multipart/form-data requests need the ${HEADER.version} header`,
          ),
        );
      }
      return readMultipart(request);
    }
    return Effect.flatMap(readBody(request), (body) => deserialize(body));
  };

  const noContext = Effect.succeed({});
  const makeContext = (
    request: HttpServerRequest.HttpServerRequest,
    calls: CreateContextOpts['info']['calls'],
    signal: AbortSignal,
  ): Effect.Effect<object, AnyTrpcError> =>
    opts.createContext
      ? Effect.withFiber((fiber) => {
          const platform = Context.get(fiber.context, CurrentPlatform);
          return Effect.tryPromise({
            try: () => base.makeContext({ request, platform, calls, signal }),
            catch: (cause) =>
              isTrpcError(cause) ? cause : unexpectedError(cause),
          });
        })
      : noContext;

  /** Runs a query or mutation and serializes the outcome. */
  const execute = (
    request: HttpServerRequest.HttpServerRequest,
    procedure: AnyProcedure,
    path: string,
    ctx: object,
    input: unknown,
    signal: AbortSignal,
    parent: Tracer.AnySpan | undefined,
    single = false,
  ): Effect.Effect<CallResult> => {
    const type = procedure['~trpc'].type;
    const response = createResponseHandle();
    const { headers } = response;
    const sink: FrameSink = {};
    if (single) frameSinks.set(response, sink);
    const toResult = (exit: Exit.Exit<unknown, AnyTrpcError>): CallResult => {
      if (Exit.isFailure(exit)) {
        const err = normalizeCause(exit.cause);
        report(err, request, path, type);
        return {
          status: statusOf(err, procedure['~trpc'].errors),
          body: wire(err),
          headers,
        };
      }
      const value = exit.value;
      if (sink.replay) {
        return { status: 200, body: undefined, frames: sink.replay, headers };
      }
      if (HttpServerResponse.isHttpServerResponse(value)) {
        return {
          status: value.status,
          body: undefined,
          response: value,
          headers,
        };
      }
      if (single && value instanceof Blob) {
        return {
          status: response.status ?? 200,
          body: undefined,
          blob: value,
          headers,
        };
      }
      try {
        const serialized = serializer.serializeDeferred(value, {
          coerceError: coerceError(request, path, type),
        });
        const { chunks } = serialized;
        if (chunks && sink.keep) {
          const frames = sink.keep(serialized.head, chunks);
          return {
            status: response.status ?? 200,
            body: undefined,
            frames,
            headers,
          };
        }
        return {
          status: response.status ?? 200,
          body: serialized.head,
          chunks,
          headers,
        };
      } catch (cause) {
        const err = unexpectedError(cause);
        report(err, request, path, type);
        return {
          status: statusOf(err, procedure['~trpc'].errors),
          body: wire(err),
          headers,
        };
      }
    };
    return Effect.map(
      base.runEffect({
        request,
        procedure,
        path,
        ctx,
        input,
        signal,
        response,
        allowResponse: single,
        parent,
      }),
      toResult,
    );
  };

  /** Frames when the client asks for them, JSONL otherwise. */
  const streamType = (request: HttpServerRequest.HttpServerRequest) =>
    accepts(request.headers['accept'], CONTENT_TYPE.frames)
      ? CONTENT_TYPE.frames
      : CONTENT_TYPE.jsonl;

  /** A streamed body of `produce`'s lines; the call's signal aborts if the client leaves. */
  const linesResponse = (
    produce: (write: (line: unknown) => void) => Effect.Effect<void>,
    controller: AbortController,
    contentType: string = CONTENT_TYPE.jsonl,
    headers?: Headers,
  ): HttpServerResponse.HttpServerResponse => {
    const binary = contentType === CONTENT_TYPE.frames;
    const lines = Stream.callback<Uint8Array>((queue) =>
      Effect.andThen(
        produce((line) => {
          Queue.offerUnsafe(
            queue,
            binary
              ? encodeRecord(line)
              : encoder.encode(
                  typeof line === 'string' ? line : `${JSON.stringify(line)}\n`,
                ),
          );
        }),
        Queue.end(queue),
      ),
    ).pipe(
      Stream.onExit((exit) =>
        Exit.hasInterrupts(exit)
          ? Effect.sync(() => controller.abort())
          : Effect.void,
      ),
    );
    return respond(
      200,
      lines,
      contentType,
      contentType === CONTENT_TYPE.sse
        ? { 'cache-control': 'no-cache' }
        : { 'cache-control': 'no-cache', vary: 'accept' },
      headers,
    );
  };

  const runChunks = (
    chunks: Stream.Stream<Chunk, unknown>,
    onChunk: (chunk: Chunk) => void,
  ) =>
    Stream.runForEach(chunks, (chunk) =>
      Effect.sync(() => onChunk(chunk)),
    ).pipe(Effect.ignore);

  /** Aborts `controller` if `effect` is interrupted (the client left). */
  const abortOnInterrupt = <A, E, R>(
    effect: Effect.Effect<A, E, R>,
    controller: AbortController,
  ): Effect.Effect<A, E, R> =>
    Effect.onExit(effect, (exit) =>
      Exit.hasInterrupts(exit)
        ? Effect.sync(() => controller.abort())
        : Effect.void,
    );

  const single = (
    request: HttpServerRequest.HttpServerRequest,
    search: string,
    path: string,
    parent: Tracer.AnySpan | undefined,
  ): Effect.Effect<HttpServerResponse.HttpServerResponse, AnyTrpcError> => {
    const found = resolveProcedure(router, path);
    return found instanceof Promise
      ? Effect.flatMap(
          Effect.promise(() => found),
          (procedure) => singleCall(request, search, path, procedure, parent),
        )
      : singleCall(request, search, path, found, parent);
  };

  const singleCall = (
    request: HttpServerRequest.HttpServerRequest,
    search: string,
    path: string,
    procedure: AnyProcedure | undefined,
    parent: Tracer.AnySpan | undefined,
  ): Effect.Effect<HttpServerResponse.HttpServerResponse, AnyTrpcError> => {
    if (!procedure) {
      return Effect.fail(
        protocolError('NOT_FOUND', `No procedure at path "${path}"`),
      );
    }
    const type = procedure['~trpc'].type;
    if (type === 'mutation' && request.method !== 'POST') {
      return Effect.fail(
        protocolError('METHOD_NOT_SUPPORTED', 'Mutations must use POST'),
      );
    }
    if (
      request.method !== 'GET' &&
      request.method !== 'POST' &&
      !((request.method as string) === 'QUERY' && type !== 'mutation')
    ) {
      return Effect.fail(
        protocolError(
          'METHOD_NOT_SUPPORTED',
          `${request.method} is not supported`,
        ),
      );
    }
    const controller = new AbortController();
    const toResponse = (
      result: CallResult,
    ): HttpServerResponse.HttpServerResponse => {
      if (result.response) {
        return rawResponse(result.response, result.headers);
      }
      if (result.blob) {
        return respond(
          result.status,
          result.blob,
          result.blob.type || 'application/octet-stream',
          blobHeaders(result.blob),
          result.headers,
        );
      }
      if (result.frames) {
        const frames = result.frames;
        return linesResponse(
          (write) =>
            Stream.runForEach(frames, (frame) =>
              Effect.sync(() => write(frame)),
            ),
          controller,
          streamType(request),
          result.headers,
        );
      }
      if (!result.chunks) {
        return respond(
          result.status,
          JSON.stringify(result.body),
          CONTENT_TYPE.json,
          undefined,
          result.headers,
        );
      }
      const chunks = result.chunks;
      return linesResponse(
        (write) =>
          Effect.suspend(() => {
            write(result.body);
            return runChunks(chunks, write);
          }),
        controller,
        streamType(request),
        result.headers,
      );
    };
    const call = chain(readInput(request, search), (input) =>
      chain(makeContext(request, [{ path, type }], controller.signal), (ctx) =>
        type === 'subscription'
          ? subscription(
              request,
              procedure,
              path,
              ctx,
              input,
              controller,
              parent,
            )
          : Effect.map(
              execute(
                request,
                procedure,
                path,
                ctx,
                input,
                controller.signal,
                parent,
                true,
              ),
              toResponse,
            ),
      ),
    );
    return Effect.catch(abortOnInterrupt(call, controller), (err) => {
      report(err, request, path, type);
      return Effect.succeed(errorResponse(err));
    });
  };

  /** A procedure's own response, with the handle's headers and the raw marker. */
  const rawResponse = (
    response: HttpServerResponse.HttpServerResponse,
    set: Headers | undefined,
  ) => {
    const options = responseOptions(set);
    const { headers } = options;
    let out = HttpServerResponse.setHeaders(response, {
      ...headers,
      ...response.headers,
      [HEADER.version]: PROTOCOL_VERSION,
      [HEADER.response]: '1',
    });
    if (options.cookies)
      out = HttpServerResponse.mergeCookies(out, options.cookies);
    return out;
  };

  const subscription = (
    request: HttpServerRequest.HttpServerRequest,
    procedure: AnyProcedure,
    path: string,
    ctx: object,
    input: unknown,
    controller: AbortController,
    parent: Tracer.AnySpan | undefined,
  ) =>
    Effect.gen(function* () {
      const lastEventId = request.headers[HEADER.lastEventId];
      const response = createResponseHandle();
      const exit = yield* base.runEffect({
        request,
        procedure,
        path,
        ctx,
        input,
        signal: controller.signal,
        response,
        lastEventId,
        parent,
      });
      if (Exit.isFailure(exit)) {
        const err = normalizeCause(exit.cause);
        report(err, request, path, 'subscription');
        return respond(
          statusOf(err, procedure['~trpc'].errors),
          JSON.stringify(wire(err)),
          CONTENT_TYPE.json,
          undefined,
          response.headers,
        );
      }
      const events = exit.value as Stream.Stream<unknown, AnyTrpcError>;
      return linesResponse(
        (write) =>
          Effect.gen(function* () {
            // Servers that buffer headers until the first body chunk (Node) would
            // otherwise hold them back until the first event.
            write(': open\n\n');
            if (ssePingMs !== false) {
              yield* Effect.sync(() => write(': ping\n\n')).pipe(
                Effect.delay(ssePingMs),
                Effect.forever,
                Effect.forkScoped,
              );
            }
            const done = yield* Effect.exit(
              emitEvents(
                events,
                serializer,
                coerceError(request, path, 'subscription'),
                (frame) => {
                  if (frame.kind === 'event') {
                    const id =
                      frame.eventId === undefined
                        ? ''
                        : `id: ${frame.eventId}\n`;
                    write(
                      frame.deferred === undefined
                        ? `${id}data: ${JSON.stringify(frame.body)}\n\n`
                        : `${id}event: ${SSE_EVENT.deferred}\ndata: ${JSON.stringify({ e: frame.deferred, body: frame.body })}\n\n`,
                    );
                  } else {
                    write(
                      `event: ${SSE_EVENT.chunk}\ndata: ${JSON.stringify(
                        frame.kind === 'chunk'
                          ? { e: frame.event, chunk: frame.chunk }
                          : { e: frame.event },
                      )}\n\n`,
                    );
                  }
                },
              ),
            );
            if (Exit.isFailure(done)) {
              if (Cause.hasInterruptsOnly(done.cause)) return;
              const err = normalizeCause(done.cause);
              report(err, request, path, 'subscription');
              write(`event: error\ndata: ${JSON.stringify(wire(err))}\n\n`);
              return;
            }
            write('event: done\ndata: \n\n');
          }).pipe(Effect.scoped),
        controller,
        CONTENT_TYPE.sse,
        response.headers,
      );
    });

  const batched = (
    request: HttpServerRequest.HttpServerRequest,
    parent: Tracer.AnySpan | undefined,
  ): Effect.Effect<HttpServerResponse.HttpServerResponse, AnyTrpcError> =>
    Effect.gen(function* () {
      if (!batch) {
        return yield* Effect.fail(
          protocolError('BAD_REQUEST', 'Batching is not enabled'),
        );
      }
      if (request.method !== 'POST') {
        return yield* Effect.fail(
          protocolError('METHOD_NOT_SUPPORTED', 'Batches must use POST'),
        );
      }
      const body = yield* readBody(request);
      if (!Array.isArray(body)) {
        return yield* Effect.fail(
          protocolError('BAD_REQUEST', 'A batch body must be an array'),
        );
      }
      if (body.length > batch.maxItems) {
        return yield* Effect.fail(
          protocolError(
            'PAYLOAD_TOO_LARGE',
            `A batch can have at most ${batch.maxItems} calls`,
          ),
        );
      }
      const calls = yield* Effect.promise(() =>
        Promise.all(
          (body as BatchCall[]).map(async (call) => {
            const path = typeof call?.path === 'string' ? call.path : '';
            return {
              path,
              input: call?.input,
              procedure: await resolveProcedure(router, path),
            };
          }),
        ),
      );
      const controller = new AbortController();
      return yield* abortOnInterrupt(
        Effect.gen(function* () {
          const ctx = yield* makeContext(
            request,
            calls.flatMap((c) =>
              c.procedure
                ? [{ path: c.path, type: c.procedure['~trpc'].type }]
                : [],
            ),
            controller.signal,
          );
          const one = (
            call: (typeof calls)[number],
          ): Effect.Effect<CallResult> =>
            Effect.gen(function* () {
              if (!call.procedure) {
                return yield* Effect.fail(
                  protocolError(
                    'NOT_FOUND',
                    `No procedure at path "${call.path}"`,
                  ),
                );
              }
              if (call.procedure['~trpc'].type === 'subscription') {
                return yield* Effect.fail(
                  protocolError(
                    'BAD_REQUEST',
                    'Subscriptions cannot be batched',
                  ),
                );
              }
              const input = yield* deserialize(call.input);
              return yield* execute(
                request,
                call.procedure,
                call.path,
                ctx,
                input,
                controller.signal,
                parent,
              );
            }).pipe(
              Effect.catch((err: AnyTrpcError) => {
                report(err, request, call.path);
                return Effect.succeed({
                  status: statusOf(err),
                  body: wire(err),
                });
              }),
            );

          // Headers are sent first, so the response waits for every call's head
          // to merge their headers (04 (d)). Deferred values still stream.
          const results = yield* Effect.all(calls.map(one), {
            concurrency: 'unbounded',
          });
          const headers = new Headers();
          for (const result of results) {
            for (const [key, value] of result.headers ?? []) {
              if (key === 'set-cookie') headers.append(key, value);
              else headers.set(key, value);
            }
          }
          return linesResponse(
            (write) =>
              Effect.forEach(
                results,
                (result, i) =>
                  Effect.suspend(() => {
                    write({
                      i,
                      status: result.status,
                      body: result.body,
                    } satisfies BatchLine);
                    return result.chunks
                      ? runChunks(result.chunks, (chunk) =>
                          write({ i, chunk } satisfies BatchLine),
                        )
                      : Effect.void;
                  }),
                { concurrency: 'unbounded', discard: true },
              ),
            controller,
            streamType(request),
            headers,
          );
        }),
        controller,
      );
    });

  const app: Effect.Effect<
    HttpServerResponse.HttpServerResponse,
    never,
    HttpServerRequest.HttpServerRequest
  > = Effect.withFiber((fiber) => {
    const context = fiber.context as Context.Context<never>;
    const request = Context.get(
      context as Context.Context<HttpServerRequest.HttpServerRequest>,
      HttpServerRequest.HttpServerRequest,
    );
    const parts = splitUrl(request.url);
    const { pathname } = parts;
    const version = request.headers[HEADER.version];
    if (version !== undefined && version !== PROTOCOL_VERSION) {
      return Effect.fail(
        protocolError(
          'UNSUPPORTED_PROTOCOL',
          `Unsupported protocol version "${version}", expected "${PROTOCOL_VERSION}"`,
        ),
      );
    }
    if (pathname !== endpoint && !pathname.startsWith(under)) {
      return Effect.fail(protocolError('NOT_FOUND', `Not found: ${pathname}`));
    }
    const rest = pathname.slice(under.length);
    const parent = parentSpanIn(request, context);
    if (rest === '' && request.headers[HEADER.batch] === '1') {
      return batched(request, parent);
    }
    return single(request, parts.search, decodeURIComponent(rest), parent);
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.flatMap(HttpServerRequest.HttpServerRequest, (request) => {
        if (Cause.hasInterruptsOnly(cause)) return Effect.failCause(cause);
        const err = normalizeCause(cause);
        report(err, request);
        return Effect.succeed(errorResponse(err));
      }),
    ),
  ) as never;

  const middleware = opts.middleware ?? [];
  const http = httpParts({
    app,
    middleware,
    endpoint,
    webSocket: (ws, request) => core.serveWebSocket(ws, request),
  });

  const core: SocketCore = {
    router,
    serializer,
    run: base.run,
    makeContext: base.makeContext,
    deserializeInput,
    publicError,
    report,
    serveWebSocket: (socket, request) =>
      serveConnection(core, webSocketConnection(socket), {
        request,
        transport: 'websocket',
        idleTimeoutMs: opts.websocket?.idleTimeoutMs ?? 60_000,
      }),
  };

  const handler: FetchHandler<unknown> = {
    websocket(socket, o) {
      serveConnection(core, webSocketConnection(socket), {
        request: HttpServerRequest.fromWeb(o.request),
        platform: o.platform,
        transport: 'websocket',
        idleTimeoutMs: opts.websocket?.idleTimeoutMs ?? 60_000,
      });
    },
    messagePort(port, o) {
      serveConnection(core, messagePortConnection(port), {
        request: HttpServerRequest.fromWeb(
          o?.request ?? new Request('http://localhost/'),
        ),
        platform: o?.platform,
        transport: 'messagePort',
      });
    },
    fetch: (request, platform) =>
      http.fetch(
        request,
        platform === undefined
          ? undefined
          : (Context.make(CurrentPlatform, platform) as Context.Context<never>),
      ),
    routes: http.routes,
    async dispose() {
      await http.dispose();
      await base.dispose();
    },
  };
  socketCores.set(handler, core);
  httpApps.set(handler, { app, middleware });
  return handler as FetchHandler<TPlatform>;
}
