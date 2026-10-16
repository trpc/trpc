import {
  Cause,
  Context,
  Effect,
  Exit,
  Queue,
  Stream,
  type Layer,
} from 'effect';
import {
  Cookies,
  HttpEffect,
  HttpServerRequest,
  HttpServerResponse,
  type HttpMiddleware,
} from 'effect/http';
import {
  isTrpcError,
  toWireError,
  TrpcError,
  type AnyTrpcError,
} from '../internal/error.ts';
import {
  blobHeaders,
  CONTENT_TYPE,
  HEADER,
  isJsonContentType,
  isMultipartContentType,
  PROTOCOL_VERSION,
  SSE_EVENT,
  type BatchCall,
  type BatchLine,
} from '../internal/protocol.ts';
import type {
  DansonForm,
  MaybePromise,
  OutputForm,
  ProcedureType,
} from '../internal/types.ts';
import {
  defaultSerializer,
  type AnySerializer,
  type Serializer,
} from '../serializer/index.ts';
import type { Chunk } from '../serializer/stream.ts';
import { createHandlerCore } from './core.ts';
import {
  createResponseHandle,
  normalizeCause,
  unexpectedError,
} from './execute.ts';
import { emitEvents } from './events.ts';
import type { AnyProcedure } from './procedure.ts';
import {
  resolveProcedure,
  type AnyRouter,
  type inferRouterContext,
  type inferRouterForm,
  type inferRouterServices,
} from './router.ts';
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

/**
 * What `createContext` receives.
 * @since 12.0.0-alpha.0
 * @stability experimental
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
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface OnErrorOpts {
  readonly error: AnyTrpcError;
  readonly path: string | undefined;
  readonly type: ProcedureType | undefined;
  readonly request: HttpServerRequest.HttpServerRequest;
}

/**
 * `createContext`, required when the router's procedures need ctx.
 * @since 12.0.0-alpha.0
 * @stability experimental
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
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type PlatformArgs<TPlatform> = [TPlatform] extends [undefined]
  ? []
  : undefined extends TPlatform
    ? [platform?: TPlatform]
    : [platform: TPlatform];

/**
 * The `platform` field of `websocket()` and `messagePort()` options.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type PlatformField<TPlatform> = undefined extends TPlatform
  ? { platform?: TPlatform }
  : { platform: TPlatform };

/**
 * `layer`, required when the router's procedures need Effect services.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type LayerOption<TServices> = [TServices] extends [never]
  ? { layer?: Layer.Layer<never, any, never> }
  : {
      /** Provides the Effect services the router's procedures need (02 S1). */
      layer: Layer.Layer<TServices, any, never>;
    };

/**
 * `serializer`, required when the router declares one on `initTrpc`, and
 * checked against it.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type SerializerOption<TForm extends OutputForm> = [TForm] extends [
  DansonForm,
]
  ? {
      /** Must match the client's. @default defaultSerializer */
      serializer?: Serializer<DansonForm>;
    }
  : {
      /** The serializer declared on `initTrpc`; must match the client's. */
      serializer: Serializer<TForm>;
    };

/**
 * Options shared by every handler.
 * @since 12.0.0-alpha.0
 * @stability experimental
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
   * logging, rate limits (13 C). `trpcdev/http`'s `cors()` also checks the
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
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type FetchHandlerOptions<
  TRouter extends AnyRouter,
  TPlatform = undefined,
> = BaseHandlerOptions<TRouter> &
  ContextOption<inferRouterContext<TRouter>, TPlatform> &
  LayerOption<inferRouterServices<TRouter>> &
  SerializerOption<inferRouterForm<TRouter>>;

/**
 * A web-standard request handler.
 * @since 12.0.0-alpha.0
 * @stability experimental
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
  /** Releases the `layer`'s resources. */
  dispose(): Promise<void>;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const protocolError = (code: string, message: string) =>
  new TrpcError({ code, message });

/** The `platform` of the request being handled. @internal */
export const CurrentPlatform: Context.Reference<unknown> =
  Context.Reference<unknown>('trpcdev/CurrentPlatform', {
    defaultValue: () => undefined,
  });

/** The `effect/http` app behind each fetch handler, for `trpcdev/http`. @internal */
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
}

/** `Headers` from a response handle, as `HttpServerResponse` options. */
const responseOptions = (
  set: Headers | undefined,
): { headers?: Record<string, string>; cookies?: Cookies.Cookies } => {
  if (!set) return {};
  const headers: Record<string, string> = {};
  for (const [key, value] of set) {
    if (key !== 'set-cookie') headers[key] = value;
  }
  const setCookie = set.getSetCookie();
  return {
    headers,
    ...(setCookie.length ? { cookies: Cookies.fromSetCookie(setCookie) } : {}),
  };
};

/** A request body a Node framework middleware already read (`express.json()`). */
const parsedBody = (
  request: HttpServerRequest.HttpServerRequest,
): Uint8Array | 'consumed' | undefined => {
  const node = request.source as { readableEnded?: unknown; body?: unknown };
  if (node.readableEnded !== true) return undefined;
  const { body } = node;
  if (typeof body === 'string') return encoder.encode(body);
  if (body instanceof Uint8Array) return body;
  if (
    body !== undefined &&
    isJsonContentType(request.headers['content-type'] ?? null)
  ) {
    return encoder.encode(JSON.stringify(body));
  }
  return 'consumed';
};

const consumedError = () =>
  new TrpcError({
    code: 'INTERNAL_SERVER_ERROR',
    message:
      'The request body was already read by another middleware. Mount tRPC before body parsers, or use one that sets req.body.',
  });

/**
 * Serves a router over the web-standard `fetch` interface (12 P-A). Works on
 * any runtime with `Request`/`Response`; `trpcdev/http` serves it with
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
 * @since 12.0.0-alpha.0
 * @stability experimental
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
  const serializer: AnySerializer =
    (opts as { serializer?: AnySerializer }).serializer ?? defaultSerializer;
  const endpoint = `/${(opts.endpoint ?? '/trpc').replace(/^\/+|\/+$/g, '')}`;
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
    const { headers: fromHandle, cookies } = responseOptions(set);
    const options = {
      status,
      contentType,
      headers: { ...fromHandle, [HEADER.version]: PROTOCOL_VERSION, ...extra },
      cookies,
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
    respond(err.status, JSON.stringify(wire(err)), CONTENT_TYPE.json);

  /** The body, at most `maxBodySize` bytes. Past it, the rest is drained, not cancelled. */
  const readBytes = (
    request: HttpServerRequest.HttpServerRequest,
  ): Effect.Effect<Uint8Array, AnyTrpcError> =>
    Effect.gen(function* () {
      const tooLarge = protocolError(
        'PAYLOAD_TOO_LARGE',
        'Request body is too large',
      );
      if (Number(request.headers['content-length'] ?? 0) > maxBodySize) {
        return yield* Effect.fail(tooLarge);
      }
      const replayed = parsedBody(request);
      if (replayed === 'consumed') return yield* Effect.fail(consumedError());
      const chunks: Uint8Array[] = [];
      let size = 0;
      const { source } = request;
      if (source instanceof Request && source.body === null) {
        // No body: nothing to read.
      } else if (replayed) {
        chunks.push(replayed);
        size = replayed.byteLength;
      } else {
        yield* Stream.runForEach(request.stream, (chunk) =>
          Effect.sync(() => {
            size += chunk.byteLength;
            if (size <= maxBodySize) chunks.push(chunk);
          }),
        ).pipe(
          Effect.mapError(
            (cause) =>
              new TrpcError({
                code: 'BAD_REQUEST',
                message: 'Could not read the request body',
                cause,
              }),
          ),
        );
      }
      if (size > maxBodySize) return yield* Effect.fail(tooLarge);
      if (chunks.length === 1) return chunks[0]!;
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return bytes;
    });

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
            headers: { 'content-type': request.headers['content-type'] ?? '' },
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

  const readInput = (request: HttpServerRequest.HttpServerRequest, url: URL) =>
    Effect.suspend((): Effect.Effect<unknown, AnyTrpcError> => {
      if (request.method === 'GET') {
        if (url.search.length <= 1) return Effect.succeed(undefined);
        return Effect.try({
          try: () => serializer.fromSearch(url.search, { input: true }),
          catch: (cause) =>
            new TrpcError({
              code: 'PARSE_ERROR',
              message: cause instanceof Error ? cause.message : 'Invalid input',
              cause,
            }),
        });
      }
      if (isMultipartContentType(request.headers['content-type'] ?? null)) {
        return readMultipart(request);
      }
      return Effect.flatMap(readBody(request), (body) => deserialize(body));
    });

  const makeContext = (
    request: HttpServerRequest.HttpServerRequest,
    calls: CreateContextOpts['info']['calls'],
    signal: AbortSignal,
  ) =>
    Effect.gen(function* () {
      const platform = yield* CurrentPlatform;
      return yield* Effect.tryPromise({
        try: () => base.makeContext({ request, platform, calls, signal }),
        catch: (cause) => (isTrpcError(cause) ? cause : unexpectedError(cause)),
      });
    });

  /** Runs a query or mutation and serializes the outcome. */
  const execute = (
    request: HttpServerRequest.HttpServerRequest,
    procedure: AnyProcedure,
    path: string,
    ctx: object,
    input: unknown,
    signal: AbortSignal,
    single = false,
  ): Effect.Effect<CallResult> =>
    Effect.gen(function* () {
      const type = procedure['~trpc'].type;
      const response = createResponseHandle();
      const { headers } = response;
      const exit = yield* Effect.promise(() =>
        base.run({
          procedure,
          path,
          ctx,
          input,
          signal,
          response,
          allowResponse: single,
        }),
      );
      if (Exit.isFailure(exit)) {
        const err = normalizeCause(exit.cause);
        report(err, request, path, type);
        return { status: err.status, body: wire(err), headers };
      }
      const value = exit.value;
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
        const { head, chunks } = serializer.serializeDeferred(value, {
          coerceError: coerceError(request, path, type),
        });
        return { status: response.status ?? 200, body: head, chunks, headers };
      } catch (cause) {
        const err = unexpectedError(cause);
        report(err, request, path, type);
        return { status: err.status, body: wire(err), headers };
      }
    });

  /** A streamed body of `produce`'s lines; the call's signal aborts if the client leaves. */
  const linesResponse = (
    produce: (write: (line: unknown) => void) => Effect.Effect<void>,
    controller: AbortController,
    contentType: string = CONTENT_TYPE.jsonl,
    headers?: Headers,
  ): HttpServerResponse.HttpServerResponse => {
    const lines = Stream.callback<string>((queue) =>
      Effect.andThen(
        produce((line) => {
          Queue.offerUnsafe(
            queue,
            typeof line === 'string' ? line : `${JSON.stringify(line)}\n`,
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
      Stream.encodeText(lines),
      contentType,
      { 'cache-control': 'no-cache' },
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

  /** Aborted when the fiber handling the request is interrupted (the client left). */
  const callSignal = Effect.acquireRelease(
    Effect.sync(() => new AbortController()),
    (controller, exit) =>
      Exit.hasInterrupts(exit)
        ? Effect.sync(() => controller.abort())
        : Effect.void,
  );

  const single = (
    request: HttpServerRequest.HttpServerRequest,
    url: URL,
    path: string,
  ): Effect.Effect<HttpServerResponse.HttpServerResponse, AnyTrpcError> =>
    Effect.gen(function* () {
      const procedure = yield* Effect.promise(async () =>
        resolveProcedure(router, path),
      );
      if (!procedure) {
        return yield* Effect.fail(
          protocolError('NOT_FOUND', `No procedure at path "${path}"`),
        );
      }
      const type = procedure['~trpc'].type;
      if (type === 'mutation' && request.method !== 'POST') {
        return yield* Effect.fail(
          protocolError('METHOD_NOT_SUPPORTED', 'Mutations must use POST'),
        );
      }
      if (
        request.method !== 'GET' &&
        request.method !== 'POST' &&
        !((request.method as string) === 'QUERY' && type !== 'mutation')
      ) {
        return yield* Effect.fail(
          protocolError(
            'METHOD_NOT_SUPPORTED',
            `${request.method} is not supported`,
          ),
        );
      }
      return yield* Effect.scoped(
        Effect.gen(function* () {
          const controller = yield* callSignal;
          const input = yield* readInput(request, url);
          const ctx = yield* makeContext(
            request,
            [{ path, type }],
            controller.signal,
          );
          if (type === 'subscription') {
            return yield* subscription(
              request,
              procedure,
              path,
              ctx,
              input,
              controller,
            );
          }
          const result = yield* execute(
            request,
            procedure,
            path,
            ctx,
            input,
            controller.signal,
            true,
          );
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
            CONTENT_TYPE.jsonl,
            result.headers,
          );
        }),
      ).pipe(
        Effect.catch((err) => {
          report(err, request, path, type);
          return Effect.succeed(errorResponse(err));
        }),
      );
    });

  /** A procedure's own response, with the handle's headers and the raw marker. */
  const rawResponse = (
    response: HttpServerResponse.HttpServerResponse,
    set: Headers | undefined,
  ) => {
    const { headers, cookies } = responseOptions(set);
    let out = HttpServerResponse.setHeaders(response, {
      ...headers,
      ...response.headers,
      [HEADER.version]: PROTOCOL_VERSION,
      [HEADER.response]: '1',
    });
    if (cookies) out = HttpServerResponse.mergeCookies(out, cookies);
    return out;
  };

  const subscription = (
    request: HttpServerRequest.HttpServerRequest,
    procedure: AnyProcedure,
    path: string,
    ctx: object,
    input: unknown,
    controller: AbortController,
  ) =>
    Effect.gen(function* () {
      const lastEventId = request.headers[HEADER.lastEventId];
      const response = createResponseHandle();
      const exit = yield* Effect.promise(() =>
        base.run({
          procedure,
          path,
          ctx,
          input,
          signal: controller.signal,
          response,
          lastEventId,
        }),
      );
      if (Exit.isFailure(exit)) {
        const err = normalizeCause(exit.cause);
        report(err, request, path, 'subscription');
        return respond(
          err.status,
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
      return yield* Effect.scoped(
        Effect.gen(function* () {
          const controller = yield* callSignal;
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
              );
            }).pipe(
              Effect.catch((err: AnyTrpcError) => {
                report(err, request, call.path);
                return Effect.succeed({ status: err.status, body: wire(err) });
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
            CONTENT_TYPE.jsonl,
            headers,
          );
        }),
      );
    });

  const app: Effect.Effect<
    HttpServerResponse.HttpServerResponse,
    never,
    HttpServerRequest.HttpServerRequest
  > = Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = new URL(request.url, 'http://localhost');
    const version = request.headers[HEADER.version];
    if (version !== undefined && version !== PROTOCOL_VERSION) {
      return yield* Effect.fail(
        protocolError(
          'UNSUPPORTED_PROTOCOL',
          `Unsupported protocol version "${version}", expected "${PROTOCOL_VERSION}"`,
        ),
      );
    }
    if (url.pathname !== endpoint && !url.pathname.startsWith(`${endpoint}/`)) {
      return yield* Effect.fail(
        protocolError('NOT_FOUND', `Not found: ${url.pathname}`),
      );
    }
    const rest = url.pathname.slice(endpoint.length + 1);
    if (rest === '' && request.headers[HEADER.batch] === '1') {
      return yield* batched(request);
    }
    return yield* single(request, url, decodeURIComponent(rest));
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
  const served = middleware.reduceRight<
    Effect.Effect<HttpServerResponse.HttpServerResponse, any, any>
  >((inner, m) => m(inner), app) as typeof app;
  const webHandler = HttpEffect.toWebHandler(served as never);

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
      webHandler(
        request,
        platform === undefined
          ? undefined
          : (Context.make(CurrentPlatform, platform) as Context.Context<never>),
      ),
    dispose: base.dispose,
  };
  socketCores.set(handler, core);
  httpApps.set(handler, { app, middleware });
  return handler as FetchHandler<TPlatform>;
}
