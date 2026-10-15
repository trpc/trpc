import { Effect, Exit, Stream, type Layer } from 'effect';
import {
  isTrpcError,
  toWireError,
  TrpcError,
  type AnyTrpcError,
} from '../internal/error.ts';
import {
  CONTENT_TYPE,
  HEADER,
  isJsonContentType,
  isMultipartContentType,
  PROTOCOL_VERSION,
  readFormData,
  SSE_EVENT,
  type BatchCall,
  type BatchLine,
} from '../internal/protocol.ts';
import type { MaybePromise, ProcedureType } from '../internal/types.ts';
import { defaultSerializer, type Serializer } from '../serializer/index.ts';
import type { Chunk } from '../serializer/stream.ts';
import { createHandlerCore } from './core.ts';
import {
  createResponseHandle,
  normalizeCause,
  unexpectedError,
} from './execute.ts';
import { emitEvents } from './events.ts';
import type { ResponseHandle } from './middleware.ts';
import type { AnyProcedure } from './procedure.ts';
import {
  resolveProcedure,
  type AnyRouter,
  type inferRouterContext,
  type inferRouterServices,
} from './router.ts';
import {
  messagePortConnection,
  serveConnection,
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
   * The HTTP request, or the upgrade request of a WebSocket. For a
   * MessagePort, the `request` passed to `handler.messagePort()`, or a
   * placeholder `http://localhost/` request.
   */
  readonly request: Request;
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
  readonly request: Request;
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
  /** Must match the client's. @default defaultSerializer */
  serializer?: Serializer;
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
  sse?: {
    /**
     * Send a comment line this often while a subscription is quiet, so
     * proxies don't close it as idle. `false` sends none.
     * @default 15_000
     */
    pingMs?: number | false;
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
  LayerOption<inferRouterServices<TRouter>>;

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

const protocolError = (code: string, message: string) =>
  new TrpcError({ code, message });

interface CallResult {
  status: number;
  body: unknown;
  chunks?: Stream.Stream<Chunk, unknown> | undefined;
  headers?: Headers | undefined;
}

/**
 * Serves a router over the web-standard `fetch` interface (12 P-A). Works on
 * any runtime with `Request`/`Response`; `trpcdev/http` serves it with
 * Effect's `HttpServer` on Node, Bun and the rest.
 *
 * @example
 * ```ts
 * const handler = createFetchHandler({
 *   router: appRouter,
 *   createContext: ({ request }) => ({ user: getUser(request) }),
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
  const serializer = opts.serializer ?? defaultSerializer;
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

  const respond = (
    status: number,
    body: BodyInit | null,
    contentType: string,
    extra?: Record<string, string>,
    set?: Headers,
  ) => {
    const headers = new Headers(set);
    headers.set('content-type', contentType);
    headers.set(HEADER.version, PROTOCOL_VERSION);
    for (const [key, value] of Object.entries(extra ?? {})) {
      headers.set(key, value);
    }
    return new Response(body, { status, headers });
  };

  async function readBody(request: Request): Promise<unknown> {
    if (!isJsonContentType(request.headers.get('content-type'))) {
      throw protocolError(
        'UNSUPPORTED_MEDIA_TYPE',
        'POST requests must have content-type: application/json',
      );
    }
    const length = Number(request.headers.get('content-length') ?? 0);
    if (length > maxBodySize) {
      throw protocolError('PAYLOAD_TOO_LARGE', 'Request body is too large');
    }
    const text = await request.text();
    if (encoder.encode(text).byteLength > maxBodySize) {
      throw protocolError('PAYLOAD_TOO_LARGE', 'Request body is too large');
    }
    if (text === '') return undefined;
    try {
      return JSON.parse(text);
    } catch (cause) {
      throw new TrpcError({
        code: 'PARSE_ERROR',
        message: 'Invalid JSON',
        cause,
      });
    }
  }

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

  async function readInput(request: Request, url: URL): Promise<unknown> {
    if (request.method === 'GET') {
      if (url.search.length <= 1) return undefined;
      try {
        return serializer.fromSearch(url.search, { input: true });
      } catch (cause) {
        throw new TrpcError({
          code: 'PARSE_ERROR',
          message: cause instanceof Error ? cause.message : 'Invalid input',
          cause,
        });
      }
    }
    if (isMultipartContentType(request.headers.get('content-type'))) {
      return readMultipart(request);
    }
    return deserializeInput(await readBody(request));
  }

  /** An `input` field with the serialized JSON, and parts `0`, `1`, … for its blobs. */
  async function readMultipart(request: Request): Promise<unknown> {
    const form = await readFormData(request, maxBodySize, () =>
      protocolError('PAYLOAD_TOO_LARGE', 'Request body is too large'),
    ).catch((cause: unknown) => {
      if (isTrpcError(cause)) throw cause;
      throw new TrpcError({
        code: 'PARSE_ERROR',
        message: 'Invalid multipart body',
        cause,
      });
    });
    const field = form.get('input');
    if (typeof field !== 'string') {
      throw protocolError(
        'BAD_REQUEST',
        'A multipart body needs an "input" field',
      );
    }
    let value: unknown;
    try {
      value = JSON.parse(field);
    } catch (cause) {
      throw new TrpcError({
        code: 'PARSE_ERROR',
        message: 'Invalid JSON',
        cause,
      });
    }
    const parts: Blob[] = [];
    for (;;) {
      const part = form.get(String(parts.length));
      if (!(part instanceof Blob)) break;
      parts.push(part);
    }
    return deserializeInput(value, parts);
  }

  const makeContext = (
    request: Request,
    calls: CreateContextOpts['info']['calls'],
  ) => base.makeContext({ request, calls });

  const run = (
    procedure: AnyProcedure,
    path: string,
    ctx: object,
    input: unknown,
    signal: AbortSignal,
    response: ResponseHandle,
    lastEventId?: string,
  ) => base.run({ procedure, path, ctx, input, signal, response, lastEventId });

  /** Runs a query or mutation and serializes the outcome. */
  async function execute(
    request: Request,
    procedure: AnyProcedure,
    path: string,
    ctx: object,
    input: unknown,
    signal: AbortSignal,
  ): Promise<CallResult> {
    const type = procedure['~trpc'].type;
    const response = createResponseHandle();
    const { headers } = response;
    const exit = await run(procedure, path, ctx, input, signal, response);
    if (Exit.isFailure(exit)) {
      const err = normalizeCause(exit.cause);
      report(err, request, path, type);
      return { status: err.status, body: wire(err), headers };
    }
    try {
      const { head, chunks } = serializer.serializeDeferred(exit.value, {
        coerceError: (cause) => {
          const err = isTrpcError(cause) ? cause : unexpectedError(cause);
          report(err, request, path, type);
          return toWireError(publicError(err));
        },
      });
      return { status: response.status ?? 200, body: head, chunks, headers };
    } catch (cause) {
      const err = unexpectedError(cause);
      report(err, request, path, type);
      return { status: err.status, body: wire(err), headers };
    }
  }

  function linesResponse(
    produce: (write: (line: unknown) => void) => Promise<void>,
    signal: AbortSignal,
    abort: () => void,
    contentType: string = CONTENT_TYPE.jsonl,
    headers?: Headers,
  ): Response {
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        let open = true;
        const write = (line: unknown) => {
          if (!open || signal.aborted) return;
          try {
            controller.enqueue(
              encoder.encode(
                typeof line === 'string' ? line : `${JSON.stringify(line)}\n`,
              ),
            );
          } catch {
            open = false;
          }
        };
        try {
          await produce(write);
        } finally {
          if (open && !signal.aborted) {
            open = false;
            controller.close();
          }
        }
      },
      cancel: abort,
    });
    return respond(
      200,
      body,
      contentType,
      { 'cache-control': 'no-cache' },
      headers,
    );
  }

  const runChunks = (
    chunks: Stream.Stream<Chunk, unknown>,
    onChunk: (chunk: Chunk) => void,
    signal: AbortSignal,
  ) =>
    Effect.runPromiseExit(
      Stream.runForEach(chunks, (chunk) => Effect.sync(() => onChunk(chunk))),
      { signal },
    );

  async function single(
    request: Request,
    url: URL,
    path: string,
  ): Promise<Response> {
    const procedure = await resolveProcedure(router, path);
    if (!procedure) {
      throw protocolError('NOT_FOUND', `No procedure at path "${path}"`);
    }
    const type = procedure['~trpc'].type;
    if (type === 'mutation' && request.method !== 'POST') {
      throw new TrpcError({
        code: 'METHOD_NOT_SUPPORTED',
        message: 'Mutations must use POST',
      });
    }
    if (
      request.method !== 'GET' &&
      request.method !== 'POST' &&
      !(request.method === 'QUERY' && type !== 'mutation')
    ) {
      throw protocolError(
        'METHOD_NOT_SUPPORTED',
        `${request.method} is not supported`,
      );
    }
    try {
      const input = await readInput(request, url);
      const ctx = await makeContext(request, [{ path, type }]);
      if (type === 'subscription') {
        return await subscription(request, procedure, path, ctx, input);
      }
      const controller = new AbortController();
      const onAbort = () => controller.abort();
      request.signal.addEventListener('abort', onAbort, { once: true });
      const result = await execute(
        request,
        procedure,
        path,
        ctx,
        input,
        controller.signal,
      );
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
        async (write) => {
          write(result.body);
          await runChunks(chunks, write, controller.signal);
        },
        controller.signal,
        onAbort,
        CONTENT_TYPE.jsonl,
        result.headers,
      );
    } catch (cause) {
      const err = isTrpcError(cause) ? cause : unexpectedError(cause);
      report(err, request, path, type);
      return respond(err.status, JSON.stringify(wire(err)), CONTENT_TYPE.json);
    }
  }

  async function subscription(
    request: Request,
    procedure: AnyProcedure,
    path: string,
    ctx: object,
    input: unknown,
  ): Promise<Response> {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    request.signal.addEventListener('abort', onAbort, { once: true });
    const lastEventId = request.headers.get(HEADER.lastEventId) ?? undefined;
    const response = createResponseHandle();
    const exit = await run(
      procedure,
      path,
      ctx,
      input,
      controller.signal,
      response,
      lastEventId,
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
    const coerceError = (cause: unknown) => {
      const err = isTrpcError(cause) ? cause : unexpectedError(cause);
      report(err, request, path, 'subscription');
      return toWireError(publicError(err));
    };
    return linesResponse(
      async (write) => {
        // Servers that buffer headers until the first body chunk (Node) would
        // otherwise hold them back until the first event.
        write(': open\n\n');
        const ping =
          ssePingMs === false
            ? undefined
            : setInterval(() => write(': ping\n\n'), ssePingMs);
        const done = await Effect.runPromiseExit(
          emitEvents(events, serializer, coerceError, (frame) => {
            if (frame.kind === 'event') {
              const id =
                frame.eventId === undefined ? '' : `id: ${frame.eventId}\n`;
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
          }),
          { signal: controller.signal },
        ).finally(() => clearInterval(ping));
        if (controller.signal.aborted) return;
        if (Exit.isFailure(done)) {
          const err = normalizeCause(done.cause);
          report(err, request, path, 'subscription');
          write(`event: error\ndata: ${JSON.stringify(wire(err))}\n\n`);
          return;
        }
        write('event: done\ndata: \n\n');
      },
      controller.signal,
      onAbort,
      CONTENT_TYPE.sse,
      response.headers,
    );
  }

  async function batched(request: Request): Promise<Response> {
    if (!batch) {
      throw protocolError('BAD_REQUEST', 'Batching is not enabled');
    }
    if (request.method !== 'POST') {
      throw protocolError('METHOD_NOT_SUPPORTED', 'Batches must use POST');
    }
    const body = await readBody(request);
    if (!Array.isArray(body)) {
      throw protocolError('BAD_REQUEST', 'A batch body must be an array');
    }
    if (body.length > batch.maxItems) {
      throw protocolError(
        'PAYLOAD_TOO_LARGE',
        `A batch can have at most ${batch.maxItems} calls`,
      );
    }
    const calls = await Promise.all(
      (body as BatchCall[]).map(async (call) => {
        const path = typeof call?.path === 'string' ? call.path : '';
        return {
          path,
          input: call?.input,
          procedure: await resolveProcedure(router, path),
        };
      }),
    );
    const ctx = await makeContext(
      request,
      calls.flatMap((c) =>
        c.procedure ? [{ path: c.path, type: c.procedure['~trpc'].type }] : [],
      ),
    );
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    request.signal.addEventListener('abort', onAbort, { once: true });

    const one = async (call: (typeof calls)[number]): Promise<CallResult> => {
      try {
        if (!call.procedure) {
          throw protocolError(
            'NOT_FOUND',
            `No procedure at path "${call.path}"`,
          );
        }
        if (call.procedure['~trpc'].type === 'subscription') {
          throw protocolError('BAD_REQUEST', 'Subscriptions cannot be batched');
        }
        return await execute(
          request,
          call.procedure,
          call.path,
          ctx,
          deserializeInput(call.input),
          controller.signal,
        );
      } catch (cause) {
        const err = isTrpcError(cause) ? cause : unexpectedError(cause);
        report(err, request, call.path);
        return { status: err.status, body: wire(err) };
      }
    };

    // Headers are sent first, so the response waits for every call's head
    // to merge their headers (04 (d)). Deferred values still stream.
    const results = await Promise.all(calls.map(one));
    const headers = new Headers();
    for (const result of results) {
      for (const [key, value] of result.headers ?? []) {
        if (key === 'set-cookie') headers.append(key, value);
        else headers.set(key, value);
      }
    }
    return linesResponse(
      async (write) => {
        await Promise.all(
          results.map(async (result, i) => {
            write({
              i,
              status: result.status,
              body: result.body,
            } satisfies BatchLine);
            if (result.chunks) {
              await runChunks(
                result.chunks,
                (chunk) => write({ i, chunk } satisfies BatchLine),
                controller.signal,
              );
            }
          }),
        );
      },
      controller.signal,
      onAbort,
      CONTENT_TYPE.jsonl,
      headers,
    );
  }

  const core: SocketCore = {
    router,
    serializer,
    run: base.run,
    makeContext: base.makeContext,
    deserializeInput,
    publicError,
    report,
  };

  const handler: FetchHandler<unknown> = {
    websocket(socket, o) {
      base.setPlatform(o.request, o.platform);
      serveConnection(core, webSocketConnection(socket), {
        request: o.request,
        transport: 'websocket',
      });
    },
    messagePort(port, o) {
      const request = o?.request ?? new Request('http://localhost/');
      base.setPlatform(request, o?.platform);
      serveConnection(core, messagePortConnection(port), {
        request,
        transport: 'messagePort',
      });
    },
    async fetch(request, platform) {
      base.setPlatform(request, platform);
      const url = new URL(request.url);
      try {
        const version = request.headers.get(HEADER.version);
        if (version !== null && version !== PROTOCOL_VERSION) {
          throw protocolError(
            'UNSUPPORTED_PROTOCOL',
            `Unsupported protocol version "${version}", expected "${PROTOCOL_VERSION}"`,
          );
        }
        if (
          url.pathname !== endpoint &&
          !url.pathname.startsWith(`${endpoint}/`)
        ) {
          throw protocolError('NOT_FOUND', `Not found: ${url.pathname}`);
        }
        const rest = url.pathname.slice(endpoint.length + 1);
        if (rest === '' && request.headers.get(HEADER.batch) === '1') {
          return await batched(request);
        }
        return await single(request, url, decodeURIComponent(rest));
      } catch (cause) {
        const err = isTrpcError(cause) ? cause : unexpectedError(cause);
        report(err, request);
        return respond(
          err.status,
          JSON.stringify(wire(err)),
          CONTENT_TYPE.json,
        );
      }
    },
    dispose: base.dispose,
  };
  return handler as FetchHandler<TPlatform>;
}
