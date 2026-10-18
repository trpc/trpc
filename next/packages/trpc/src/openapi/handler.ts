import {
  Cause,
  Context,
  Effect,
  Exit,
  Fiber,
  Stream,
  type Layer,
} from 'effect';
import {
  HttpEffect,
  HttpServerRequest,
  HttpServerResponse,
  type HttpMiddleware,
} from 'effect/http';
import type { ContractJson } from '../contract/index.ts';
import {
  flattenRoutes,
  inputJsonSchema,
  scopedRoute,
  type FlatRoutes,
} from '../internal/describe.ts';
import {
  isTrpcError,
  statusOf,
  TrpcError,
  type AnyTrpcError,
} from '../internal/error.ts';
import { toAsyncIterable } from '../internal/effects.ts';
import type { JsonSchema } from '../internal/json-schema.ts';
import {
  contentDisposition,
  hasMediaType,
  isJsonContentType,
} from '../internal/protocol.ts';
import type { MaybePromise, ProcedureType } from '../internal/types.ts';
import {
  createHandlerCore,
  CurrentPlatform,
  readBytes,
  type ContextOption,
  type CreateContextOpts,
  type LayerOption,
  type OnErrorOpts,
  type PlatformArgs,
} from '../server/handler/index.ts';
import {
  createResponseHandle,
  normalizeCause,
  unexpectedError,
} from '../server/execution/index.ts';
import {
  type AnyProcedure,
  resolveProcedure,
  type AnyRouter,
  type inferRouterContext,
  type inferRouterServices,
} from '../server/procedures/index.ts';
import { isTracked } from '../server/subscriptions/index.ts';
import {
  experimental_parseBracketNotation,
  experimental_coerceBySchema,
  propertySchema,
  toOpenApiError,
  compileRoute,
  normalizePrefix,
  experimental_resolveRoute,
  routeOf,
  usesQuery,
  type ResolvedRoute,
  type Route,
} from './rest/index.ts';

/**
 * Options shared by every OpenAPI handler.
 * @since 0.1.0
 * @stability experimental
 */
export interface BaseOpenApiHandlerOptions<TRouter extends AnyRouter> {
  router: TRouter;
  /**
   * Prepended to every route's path.
   * @default '/api'
   */
  prefix?: string;
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
   * Effect HTTP middleware around the handler, outermost first, e.g.
   * {@link experimental_openApiReference} or `cors()`.
   * @example
   * ```ts
   * middleware: [cors(), experimental_openApiReference({ router: appRouter, specGenerateOptions })],
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
  /**
   * The routes, from `experimental_toContract(await loadRouter(appRouter))` at build
   * time. Lazy subtrees then load on their first request, whatever their
   * `route.prefix` (08 Q8.4).
   */
  contract?: ContractJson<TRouter>;
}

/**
 * The options of {@link experimental_createOpenApiHandler}.
 * @since 0.1.0
 * @stability experimental
 */
export type OpenApiHandlerOptions<
  TRouter extends AnyRouter,
  TPlatform = undefined,
> = BaseOpenApiHandlerOptions<TRouter> &
  ContextOption<inferRouterContext<TRouter>, TPlatform> &
  LayerOption<inferRouterServices<TRouter>>;

/**
 * A web-standard handler for the REST mapping of a router.
 * @since 0.1.0
 * @stability experimental
 */
export interface OpenApiHandler<TPlatform = undefined> {
  /** Handles one HTTP request. `platform` reaches `createContext`. */
  readonly fetch: (
    request: Request,
    ...platform: PlatformArgs<TPlatform>
  ) => Promise<Response>;
  /**
   * Serves `request` with one procedure, without matching routes, for
   * frameworks that route requests themselves (`@trpc12/nest`). The
   * handler's `middleware`, `createContext` and `layer` apply as in `fetch`.
   */
  readonly serve: (
    request: Request,
    call: OpenApiCall,
    ...platform: PlatformArgs<TPlatform>
  ) => Promise<Response>;
  /** Releases the `layer`'s resources. */
  dispose(): Promise<void>;
}

/**
 * The procedure {@link OpenApiHandler.serve} runs.
 * @example
 * ```ts
 * await openapi.serve(request, { path: 'post.byId', procedure, params: { id: '1' } });
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export interface OpenApiCall {
  /** The procedure path (`post.byId`), for spans and `onError`. */
  readonly path: string;
  readonly procedure: AnyProcedure;
  /** Replaces the procedure's own `route` meta, as a router's `route` meta does. */
  readonly route?: Route | undefined;
  /** The path params the framework matched. */
  readonly params?: Readonly<Record<string, string>>;
}

const SelectedCall = Context.Reference<OpenApiCall | undefined>(
  '@trpc12/trpc/openapi/SelectedCall',
  { defaultValue: () => undefined },
);

interface Entry {
  readonly path: string;
  readonly type: ProcedureType;
  readonly resolve: () => MaybePromise<AnyProcedure | undefined>;
  readonly route: ResolvedRoute;
  readonly match: (pathname: string) => Record<string, string> | undefined;
  readonly input: JsonSchema | undefined;
}

/** A request as `app` received it. */
interface Incoming {
  readonly http: HttpServerRequest.HttpServerRequest;
  readonly request: Request;
  readonly url: URL;
  readonly platform: unknown;
}

interface Body {
  readonly value: unknown;
  /** From a form, so every value is a string to coerce. */
  readonly fromStrings: boolean;
}
const noBody: Body = { value: undefined, fromStrings: false };

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const toError = (cause: unknown): AnyTrpcError =>
  isTrpcError(cause) ? cause : unexpectedError(cause);

const json = (status: number, body: unknown, headers?: Headers) => {
  const h = new Headers(headers);
  h.set('content-type', 'application/json');
  return new Response(JSON.stringify(body), { status, headers: h });
};

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' &&
  v !== null &&
  Object.getPrototypeOf(v) === Object.prototype;

const isForm = (type: string | null): type is string =>
  hasMediaType(
    type,
    'application/x-www-form-urlencoded',
    'multipart/form-data',
  );

/** Static segments before params, so `/posts/latest` wins over `/posts/{id}`. */
const specificity = (route: ResolvedRoute) =>
  route.path
    .split('/')
    .map((s) => (s.startsWith('{') ? '1' : '0'))
    .join('');

/**
 * Serves a router over REST (18 O-A): each procedure at its `route` meta (or
 * the default `GET|POST {prefix}/post/byId`), path params, bracket-notation
 * query strings and forms coerced from the input's JSON Schema, plain JSON
 * bodies, declared errors with their status, and subscriptions as
 * `text/event-stream`. Serve it next to the RPC handler; both share the
 * router.
 *
 * Deferred values (`Promise`s and `AsyncIterable`s inside outputs) are not
 * supported over REST; a `Blob` or `File` output is sent as the body.
 *
 * @example
 * ```ts
 * const openapi = experimental_createOpenApiHandler({
 *   router: appRouter,
 *   createContext,
 *   middleware: [experimental_openApiReference({ router: appRouter, specGenerateOptions: { info: { title: 'API', version: '1.0.0' } } })],
 * });
 * // GET /api/posts/1, GET /api/docs, GET /api/openapi.json
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export function experimental_createOpenApiHandler<
  TRouter extends AnyRouter,
  TPlatform = undefined,
>(opts: OpenApiHandlerOptions<TRouter, TPlatform>): OpenApiHandler<TPlatform> {
  const base = createHandlerCore(
    opts as typeof opts & {
      createContext?: (o: CreateContextOpts<any>) => MaybePromise<object>;
      layer?: Layer.Layer<any, any, never>;
    },
  );
  const prefix = normalizePrefix(opts.prefix);
  const maxBodySize = opts.maxBodySize ?? 1_048_576;
  const ssePingMs = opts.sse?.pingMs ?? 15_000;

  const makeEntry = (
    path: string,
    type: ProcedureType,
    route: Route | undefined,
    input: JsonSchema | undefined,
    resolve: Entry['resolve'],
  ): Entry => {
    const resolved = experimental_resolveRoute(path, type, route, prefix);
    return {
      path,
      type,
      resolve,
      route: resolved,
      match: compileRoute(resolved.path),
      input,
    };
  };

  /** Lazy subtrees still to load, by their full route prefix. */
  let pending: FlatRoutes['lazies'] = [];
  const build = (): Entry[] => {
    let list: Entry[];
    if (opts.contract) {
      list = Object.entries(opts.contract.procedures).map(([path, p]) =>
        makeEntry(path, p.type, p.route, p.input, () =>
          resolveProcedure(opts.router, path),
        ),
      );
    } else {
      const flat = flattenRoutes(opts.router);
      pending = flat.lazies;
      list = flat.procedures.map((leaf) => {
        const def = leaf.procedure['~trpc'];
        return makeEntry(
          leaf.path,
          def.type,
          scopedRoute(leaf.path, routeOf(def), leaf.scope),
          inputJsonSchema(def),
          () => leaf.procedure,
        );
      });
    }
    list.sort((a, b) =>
      specificity(a.route).localeCompare(specificity(b.route)),
    );
    const seen = new Map<string, string>();
    for (const e of list) {
      const key = `${e.route.method} ${e.route.path.replace(/\{[^{}]+\}/g, '{}')}`;
      const other = seen.get(key);
      if (other) {
        throw new Error(
          `experimental_createOpenApiHandler: "${e.path}" and "${other}" both map to ${key}`,
        );
      }
      seen.set(key, e.path);
    }
    return list;
  };
  let entries = build();

  /** Input JSON Schemas by schema, so a procedure built per request reuses one. */
  const inputSchemas = new WeakMap<object, JsonSchema | undefined>();
  const entryFor = (call: OpenApiCall): Entry => {
    const def = call.procedure['~trpc'];
    const inputs = def.steps.filter((s) => s.kind === 'input');
    const key = inputs.length === 1 ? inputs[0]!.arg : undefined;
    let input = key ? inputSchemas.get(key) : undefined;
    if (!key || !inputSchemas.has(key)) {
      input = inputJsonSchema(def);
      if (key) inputSchemas.set(key, input);
    }
    return makeEntry(
      call.path,
      def.type,
      call.route ?? routeOf(def),
      input,
      () => call.procedure,
    );
  };

  /** Loads `lazies`, then rebuilds the routes with what they added. */
  const load = (lazies: FlatRoutes['lazies']) =>
    Effect.forEach(
      lazies,
      (l) =>
        Effect.tryPromise({
          try: () => l.lazy['~lazy'].load(),
          catch: toError,
        }),
      { concurrency: 'unbounded', discard: true },
    ).pipe(
      Effect.andThen(
        Effect.try({
          try: () => {
            entries = build();
          },
          catch: toError,
        }),
      ),
    );

  /** Loads lazy subtrees without a prefix, until none are left. */
  const loadUnprefixed: Effect.Effect<void, AnyTrpcError> = Effect.suspend(
    () => {
      const unprefixed = pending.filter((l) => !l.scope.prefix);
      if (unprefixed.length === 0) return Effect.void;
      return Effect.andThen(load(unprefixed), loadUnprefixed);
    },
  );
  /** Started with the handler; the first request waits for it. */
  let startup: Fiber.Fiber<void, AnyTrpcError> | undefined =
    Effect.runFork(loadUnprefixed);

  /** Loads the prefixed lazy subtrees `pathname` falls under. */
  const loadFor = (pathname: string): Effect.Effect<void, AnyTrpcError> =>
    Effect.suspend(() => {
      const hits = pending.filter((l) =>
        `${pathname}/`.startsWith(`${prefix}${l.scope.prefix}/`),
      );
      if (hits.length === 0) return Effect.void;
      return load(hits).pipe(
        Effect.andThen(loadUnprefixed),
        Effect.andThen(loadFor(pathname)),
      );
    });

  const fail = (
    err: AnyTrpcError,
    headers?: Headers,
    procedure?: AnyProcedure,
  ) =>
    json(
      statusOf(err, procedure?.['~trpc'].errors),
      toOpenApiError(base.publicError(err)),
      headers,
    );

  const readBody = (
    http: HttpServerRequest.HttpServerRequest,
  ): Effect.Effect<Body, AnyTrpcError> =>
    Effect.gen(function* () {
      const bytes = yield* readBytes(http, maxBodySize);
      const type = http.headers['content-type'] ?? null;
      if (isForm(type)) {
        const form =
          bytes.byteLength === 0
            ? new FormData()
            : yield* Effect.tryPromise({
                try: () =>
                  new Response(bytes as BodyInit, {
                    headers: { 'content-type': type },
                  }).formData(),
                catch: (cause) =>
                  new TrpcError({
                    code: 'PARSE_ERROR',
                    message: 'Invalid form body',
                    cause,
                  }),
              });
        return {
          value: experimental_parseBracketNotation(
            form as unknown as Iterable<[string, string]>,
          ),
          fromStrings: true,
        };
      }
      const text = decoder.decode(bytes);
      if (text === '') return noBody;
      if (!isJsonContentType(type)) {
        return yield* Effect.fail(
          new TrpcError({
            code: 'UNSUPPORTED_MEDIA_TYPE',
            message:
              'Bodies must be application/json, application/x-www-form-urlencoded or multipart/form-data',
          }),
        );
      }
      return yield* Effect.try({
        try: () => ({ value: JSON.parse(text) as unknown, fromStrings: false }),
        catch: (cause) =>
          new TrpcError({
            code: 'PARSE_ERROR',
            message: 'Invalid JSON',
            cause,
          }),
      });
    });

  const readInput = (
    http: HttpServerRequest.HttpServerRequest,
    request: Request,
    url: URL,
    entry: Entry,
    params: Record<string, string>,
  ): Effect.Effect<unknown, AnyTrpcError> =>
    Effect.flatMap(
      usesQuery(entry.route.method) ? Effect.succeed(noBody) : readBody(http),
      (body) =>
        Effect.try({
          try: () => inputOf(request, url, entry, params, body),
          catch: toError,
        }),
    );

  function inputOf(
    request: Request,
    url: URL,
    entry: Entry,
    params: Record<string, string>,
    body: Body,
  ): unknown {
    const query = experimental_parseBracketNotation(url.searchParams);
    const schema = entry.input;

    if (entry.route.inputStructure === 'detailed') {
      const part = (key: string, value: unknown) =>
        experimental_coerceBySchema(value, propertySchema(schema, key), schema);
      return {
        params: part('params', params),
        query: part('query', query),
        headers: part('headers', Object.fromEntries(request.headers)),
        body: body.fromStrings ? part('body', body.value) : body.value,
      };
    }

    const hasParams = Object.keys(params).length > 0;
    if (usesQuery(entry.route.method)) {
      if (!hasParams && Object.keys(query).length === 0) return undefined;
      return experimental_coerceBySchema({ ...query, ...params }, schema);
    }
    if (body.fromStrings) {
      return experimental_coerceBySchema(
        { ...(body.value as object), ...params },
        schema,
      );
    }
    if (!hasParams) return body.value;
    if (body.value !== undefined && !isPlainObject(body.value)) {
      throw new TrpcError({
        code: 'BAD_REQUEST',
        message: 'A route with path params needs an object body',
      });
    }
    return {
      ...(body.value as object | undefined),
      ...(experimental_coerceBySchema(params, schema) as object),
    };
  }

  function output(
    entry: Entry,
    value: unknown,
    status: number,
    headers: Headers,
  ) {
    let body = value;
    if (entry.route.outputStructure === 'detailed' && isPlainObject(value)) {
      const detailed = value as {
        status?: number;
        headers?: Record<string, string>;
        body?: unknown;
      };
      if (detailed.status !== undefined) status = detailed.status;
      for (const [k, v] of Object.entries(detailed.headers ?? {})) {
        headers.set(k, v);
      }
      body = detailed.body;
    }
    if (body instanceof Blob) {
      headers.set('content-type', body.type || 'application/octet-stream');
      if (body instanceof File) {
        headers.set('content-disposition', contentDisposition(body.name));
      }
      return new Response(body, { status, headers });
    }
    if (body === undefined) return new Response(null, { status, headers });
    return json(status, body, headers);
  }

  function events(
    http: HttpServerRequest.HttpServerRequest,
    entry: Entry,
    stream: Stream.Stream<unknown, AnyTrpcError>,
    controller: AbortController,
    headers: Headers,
  ): Response {
    const messages = stream.pipe(
      Stream.map((event) => {
        const [id, data] = isTracked(event)
          ? [`id: ${event.id}\n`, event.data]
          : ['', event];
        return `${id}event: message\ndata: ${JSON.stringify(data)}\n\n`;
      }),
      Stream.concat(Stream.make('event: done\ndata: \n\n')),
      Stream.catchCause((cause) => {
        if (Cause.hasInterruptsOnly(cause)) return Stream.empty;
        const err = normalizeCause(cause);
        base.report(err, http, entry.path, 'subscription');
        return Stream.make(
          `event: error\ndata: ${JSON.stringify(toOpenApiError(base.publicError(err)))}\n\n`,
        );
      }),
    );
    // `: open` flushes headers on servers that hold them until the first chunk.
    const lines = Stream.concat(
      Stream.make(': open\n\n'),
      ssePingMs === false
        ? messages
        : Stream.merge(
            messages,
            Stream.fromEffectRepeat(
              Effect.delay(Effect.succeed(': ping\n\n'), ssePingMs),
            ),
            { haltStrategy: 'left' },
          ),
    );
    // Pulled, so a slow client holds the subscription back instead of
    // its events piling up here.
    const iterator = toAsyncIterable(lines, controller.signal)[
      Symbol.asyncIterator
    ]();
    const body = new ReadableStream<Uint8Array>({
      async pull(sink) {
        const next = await iterator.next();
        if (next.done) sink.close();
        else sink.enqueue(encoder.encode(next.value));
      },
      cancel: () => controller.abort(),
    });
    headers.set('content-type', 'text/event-stream');
    headers.set('cache-control', 'no-cache');
    return new Response(body, { status: 200, headers });
  }

  const serve = (
    incoming: Incoming,
    entry: Entry,
    params: Record<string, string>,
  ): Effect.Effect<Response, AnyTrpcError> =>
    Effect.gen(function* () {
      const { http, request } = incoming;
      const type = entry.type;
      const procedure = yield* Effect.tryPromise({
        try: async () => await entry.resolve(),
        catch: toError,
      });
      if (!procedure) {
        return yield* Effect.fail(
          new TrpcError({
            code: 'NOT_FOUND',
            message: `The contract's "${entry.path}" is not in the router`,
          }),
        );
      }
      const input = yield* readInput(
        http,
        request,
        incoming.url,
        entry,
        params,
      );
      // Outlives this fiber: a subscription's events are read after it ends.
      const controller = new AbortController();
      request.signal.addEventListener('abort', () => controller.abort(), {
        once: true,
      });
      const ctx = yield* base.makeContextEffect({
        request: http,
        platform: incoming.platform,
        calls: [{ path: entry.path, type }],
        signal: controller.signal,
      });
      const response = createResponseHandle();
      const exit = yield* base.runEffect({
        request: http,
        procedure,
        path: entry.path,
        ctx,
        input,
        signal: controller.signal,
        response,
        lastEventId: request.headers.get('last-event-id') ?? undefined,
        allowResponse: type !== 'subscription',
      });
      if (Exit.isFailure(exit)) {
        const err = normalizeCause(exit.cause);
        base.report(err, http, entry.path, type);
        return fail(err, response.headers, procedure);
      }
      if (type === 'subscription') {
        return events(
          http,
          entry,
          exit.value as Stream.Stream<unknown, AnyTrpcError>,
          controller,
          response.headers,
        );
      }
      if (HttpServerResponse.isHttpServerResponse(exit.value)) {
        const web = HttpServerResponse.toWeb(exit.value);
        for (const [key, value] of response.headers) {
          if (key === 'set-cookie') web.headers.append(key, value);
          else if (!web.headers.has(key)) web.headers.set(key, value);
        }
        return web;
      }
      return output(
        entry,
        exit.value,
        response.status ?? entry.route.successStatus,
        response.headers,
      );
    });

  /** Reports what `effect` failed or died with and sends it as the response. */
  const recover = (
    effect: Effect.Effect<Response, AnyTrpcError>,
    http: HttpServerRequest.HttpServerRequest,
    path?: string,
    type?: ProcedureType,
  ): Effect.Effect<Response, AnyTrpcError> =>
    Effect.catchCause(effect, (cause) => {
      if (Cause.hasInterruptsOnly(cause)) return Effect.failCause(cause);
      const err = toError(Cause.squash(cause));
      base.report(err, http, path, type);
      return Effect.succeed(fail(err));
    });

  const route = (incoming: Incoming): Effect.Effect<Response, AnyTrpcError> =>
    Effect.gen(function* () {
      const { url } = incoming;
      const method = incoming.request.method;
      if (startup) {
        yield* Fiber.join(startup);
        startup = undefined;
      }
      yield* loadFor(url.pathname);
      let allowed = false;
      for (const entry of entries) {
        const params = entry.match(url.pathname);
        if (!params) continue;
        if (entry.route.method !== method) {
          allowed = true;
          continue;
        }
        return yield* recover(
          serve(incoming, entry, params),
          incoming.http,
          entry.path,
          entry.type,
        );
      }
      return yield* Effect.fail(
        new TrpcError(
          allowed
            ? {
                code: 'METHOD_NOT_SUPPORTED',
                message: `${method} is not supported for ${url.pathname}`,
              }
            : { code: 'NOT_FOUND', message: `Not found: ${url.pathname}` },
        ),
      );
    });

  const app = Effect.gen(function* () {
    const http = yield* HttpServerRequest.HttpServerRequest;
    // `webHandler` is the only way in, so the source is a web Request.
    const request = http.source as Request;
    const incoming: Incoming = {
      http,
      request,
      url: new URL(request.url),
      platform: yield* CurrentPlatform,
    };
    const call = yield* SelectedCall;
    const response = yield* call
      ? recover(
          Effect.suspend(() =>
            serve(incoming, entryFor(call), { ...call.params }),
          ),
          http,
          call.path,
          call.procedure['~trpc'].type,
        )
      : recover(route(incoming), http);
    return HttpServerResponse.fromWeb(response);
  });
  const served = (opts.middleware ?? []).reduceRight<
    Effect.Effect<HttpServerResponse.HttpServerResponse, any, any>
  >((inner, m) => m(inner), app);
  const webHandler = HttpEffect.toWebHandler(served as never);

  const handler: OpenApiHandler<unknown> = {
    fetch: (request, platform) =>
      webHandler(
        request,
        platform === undefined
          ? undefined
          : (Context.make(CurrentPlatform, platform) as Context.Context<never>),
      ),
    serve: (request, call, platform) =>
      webHandler(
        request,
        Context.make(SelectedCall, call).pipe(
          Context.add(CurrentPlatform, platform),
        ) as Context.Context<never>,
      ),
    dispose: base.dispose,
  };
  return handler as OpenApiHandler<TPlatform>;
}
