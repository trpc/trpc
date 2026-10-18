import { Cause, Context, Effect, Exit, Stream, type Layer } from 'effect';
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
import { isTrpcError, statusOf, type AnyTrpcError } from '../internal/error.ts';
import { failure, Reason } from '../internal/failure.ts';
import { toAsyncIterable } from '../internal/effects.ts';
import type { JsonSchema } from '../internal/json-schema.ts';
import {
  contentDisposition,
  hasMediaType,
  isJsonContentType,
  readFormData,
} from '../internal/protocol.ts';
import type { MaybePromise, ProcedureType } from '../internal/types.ts';
import { createHandlerCore } from '../server/core.ts';
import {
  createResponseHandle,
  normalizeCause,
  unexpectedError,
} from '../server/execute.ts';
import {
  CurrentPlatform,
  type ContextOption,
  type CreateContextOpts,
  type LayerOption,
  type OnErrorOpts,
  type PlatformArgs,
} from '../server/fetch.ts';
import type { AnyProcedure } from '../server/procedure.ts';
import {
  resolveProcedure,
  type AnyRouter,
  type inferRouterContext,
  type inferRouterServices,
} from '../server/router.ts';
import { isTracked } from '../server/tracked.ts';
import { parseBracketNotation } from './bracket.ts';
import { coerceBySchema, propertySchema } from './coerce.ts';
import { toOpenApiError } from './errors.ts';
import {
  compileRoute,
  normalizePrefix,
  resolveRoute,
  routeOf,
  usesQuery,
  type ResolvedRoute,
  type Route,
} from './routes.ts';

/**
 * Options shared by every OpenAPI handler.
 * @since 0.1.0
 * @stability stable
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
   * {@link openApiReference} or `cors()`.
   * @example
   * ```ts
   * middleware: [cors(), openApiReference({ router: appRouter, specGenerateOptions })],
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
   * The routes, from `toContract(await loadRouter(appRouter))` at build
   * time. Lazy subtrees then load on their first request, whatever their
   * `route.prefix` (08 Q8.4).
   */
  contract?: ContractJson<TRouter>;
}

/**
 * The options of {@link createOpenApiHandler}.
 * @since 0.1.0
 * @stability stable
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
 * @stability stable
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
 * @stability stable
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

const encoder = new TextEncoder();

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
 * const openapi = createOpenApiHandler({
 *   router: appRouter,
 *   createContext,
 *   middleware: [openApiReference({ router: appRouter, specGenerateOptions: { info: { title: 'API', version: '1.0.0' } } })],
 * });
 * // GET /api/posts/1, GET /api/docs, GET /api/openapi.json
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function createOpenApiHandler<
  TRouter extends AnyRouter,
  TPlatform = undefined,
>(opts: OpenApiHandlerOptions<TRouter, TPlatform>): OpenApiHandler<TPlatform> {
  const base = createHandlerCore(
    opts as typeof opts & {
      createContext?: (o: CreateContextOpts<any>) => MaybePromise<object>;
      layer?: Layer.Layer<any, any, never>;
    },
  );
  const platforms = new WeakMap<Request, unknown>();
  const httpRequests = new WeakMap<
    Request,
    HttpServerRequest.HttpServerRequest
  >();
  /** Set by `app` before it serves the request. */
  const httpOf = (request: Request) => httpRequests.get(request)!;
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
    const resolved = resolveRoute(path, type, route, prefix);
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
          `createOpenApiHandler: "${e.path}" and "${other}" both map to ${key}`,
        );
      }
      seen.set(key, e.path);
    }
    return list;
  };
  let entries = build();

  const selected = new WeakMap<Request, OpenApiCall>();
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

  /** Loads lazy subtrees without a prefix, until none are left. */
  const loadUnprefixed = async (): Promise<void> => {
    const unprefixed = pending.filter((l) => !l.scope.prefix);
    if (unprefixed.length === 0) return;
    await Promise.all(unprefixed.map((l) => l.lazy['~lazy'].load()));
    entries = build();
    await loadUnprefixed();
  };
  let startup: Promise<void> | undefined = loadUnprefixed();
  startup.catch(() => {});

  /** Loads the prefixed lazy subtrees `pathname` falls under. */
  const loadFor = async (pathname: string): Promise<void> => {
    const hits = pending.filter((l) =>
      `${pathname}/`.startsWith(`${prefix}${l.scope.prefix}/`),
    );
    if (hits.length === 0) return;
    await Promise.all(hits.map((l) => l.lazy['~lazy'].load()));
    entries = build();
    await loadUnprefixed();
    await loadFor(pathname);
  };

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

  async function readBody(request: Request): Promise<{
    value: unknown;
    fromStrings: boolean;
  }> {
    const length = Number(request.headers.get('content-length') ?? 0);
    if (length > maxBodySize)
      throw failure(Reason.BodyTooLarge({ limit: maxBodySize }));
    const type = request.headers.get('content-type');
    if (isForm(type)) {
      const form = await readFormData(request, type, maxBodySize, () =>
        failure(Reason.BodyTooLarge({ limit: maxBodySize })),
      ).catch((cause: unknown) => {
        if (isTrpcError(cause)) throw cause;
        throw failure(Reason.InvalidFormBody(), cause);
      });
      return {
        value: parseBracketNotation(
          form as unknown as Iterable<[string, string]>,
        ),
        fromStrings: true,
      };
    }
    const text = await request.text();
    if (encoder.encode(text).byteLength > maxBodySize) {
      throw failure(Reason.BodyTooLarge({ limit: maxBodySize }));
    }
    if (text === '') return { value: undefined, fromStrings: false };
    if (!isJsonContentType(type)) {
      throw failure(Reason.UnsupportedBodyType());
    }
    try {
      return { value: JSON.parse(text), fromStrings: false };
    } catch (cause) {
      throw failure(Reason.InvalidJson(), cause);
    }
  }

  async function readInput(
    request: Request,
    url: URL,
    entry: Entry,
    params: Record<string, string>,
  ): Promise<unknown> {
    const query = parseBracketNotation(url.searchParams);
    const body = usesQuery(entry.route.method)
      ? { value: undefined, fromStrings: false }
      : await readBody(request);
    const schema = entry.input;

    if (entry.route.inputStructure === 'detailed') {
      const part = (key: string, value: unknown) =>
        coerceBySchema(value, propertySchema(schema, key), schema);
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
      return coerceBySchema({ ...query, ...params }, schema);
    }
    if (body.fromStrings) {
      return coerceBySchema({ ...(body.value as object), ...params }, schema);
    }
    if (!hasParams) return body.value;
    if (body.value !== undefined && !isPlainObject(body.value)) {
      throw failure(Reason.PathParamsNeedObjectBody());
    }
    return {
      ...(body.value as object | undefined),
      ...(coerceBySchema(params, schema) as object),
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
    request: Request,
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
        base.report(err, httpOf(request), entry.path, 'subscription');
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

  async function serve(
    request: Request,
    url: URL,
    entry: Entry,
    params: Record<string, string>,
  ): Promise<Response> {
    const type = entry.type;
    const procedure = await entry.resolve();
    if (!procedure) {
      throw failure(Reason.ContractRouteMissing({ path: entry.path }));
    }
    const input = await readInput(request, url, entry, params);
    const controller = new AbortController();
    request.signal.addEventListener('abort', () => controller.abort(), {
      once: true,
    });
    const ctx = await base.makeContext({
      request: httpOf(request),
      platform: platforms.get(request),
      calls: [{ path: entry.path, type }],
      signal: controller.signal,
    });
    const response = createResponseHandle();
    const exit = await base.run({
      request: httpOf(request),
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
      base.report(err, httpOf(request), entry.path, type);
      return fail(err, response.headers, procedure);
    }
    if (type === 'subscription') {
      return events(
        request,
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
  }

  async function serveWeb(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const call = selected.get(request);
    if (call) {
      try {
        return await serve(request, url, entryFor(call), { ...call.params });
      } catch (cause) {
        const err = isTrpcError(cause) ? cause : unexpectedError(cause);
        base.report(
          err,
          httpOf(request),
          call.path,
          call.procedure['~trpc'].type,
        );
        return fail(err);
      }
    }
    try {
      if (startup) {
        await startup;
        startup = undefined;
      }
      await loadFor(url.pathname);
      let allowed = false;
      for (const entry of entries) {
        const params = entry.match(url.pathname);
        if (!params) continue;
        if (entry.route.method !== request.method) {
          allowed = true;
          continue;
        }
        try {
          return await serve(request, url, entry, params);
        } catch (cause) {
          const err = isTrpcError(cause) ? cause : unexpectedError(cause);
          base.report(err, httpOf(request), entry.path, entry.type);
          return fail(err);
        }
      }
      throw failure(
        allowed
          ? Reason.MethodNotSupported({
              method: request.method,
              path: url.pathname,
            })
          : Reason.RouteNotFound({ path: url.pathname }),
      );
    } catch (cause) {
      const err = isTrpcError(cause) ? cause : unexpectedError(cause);
      base.report(err, httpOf(request));
      return fail(err);
    }
  }

  const app = Effect.gen(function* () {
    const http = yield* HttpServerRequest.HttpServerRequest;
    const platform = yield* CurrentPlatform;
    // `webHandler` is the only way in, so the source is a web Request.
    const request = http.source as Request;
    httpRequests.set(request, http);
    if (platform !== undefined) platforms.set(request, platform);
    const call = yield* SelectedCall;
    if (call) selected.set(request, call);
    return HttpServerResponse.fromWeb(
      yield* Effect.promise(() => serveWeb(request)),
    );
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
