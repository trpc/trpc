import { Effect, Exit, Stream, type Layer } from 'effect';
import type { ContractJson } from '../contract/index.ts';
import {
  flattenRoutes,
  inputJsonSchema,
  scopedRoute,
  type FlatRoutes,
} from '../internal/describe.ts';
import {
  isTrpcError,
  TrpcError,
  type AnyTrpcError,
} from '../internal/error.ts';
import type { JsonSchema } from '../internal/json-schema.ts';
import { isJsonContentType } from '../internal/protocol.ts';
import type { MaybePromise, ProcedureType } from '../internal/types.ts';
import { createHandlerCore } from '../server/core.ts';
import {
  createResponseHandle,
  normalizeCause,
  unexpectedError,
} from '../server/execute.ts';
import type {
  ContextOption,
  CreateContextOpts,
  LayerOption,
  OnErrorOpts,
} from '../server/fetch.ts';
import type { AnyProcedure, Route } from '../server/procedure.ts';
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
  usesQuery,
  type ResolvedRoute,
} from './routes.ts';

/**
 * What an {@link OpenApiPlugin} receives.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface OpenApiPluginContext {
  readonly router: AnyRouter;
  /** The handler's normalized prefix: `''` or `/api`. */
  readonly prefix: string;
}

/**
 * Extends the OpenAPI handler, e.g. {@link openApiReference}. A plugin sees
 * each request first and may answer it.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface OpenApiPlugin {
  fetch?(
    request: Request,
    ctx: OpenApiPluginContext,
  ): MaybePromise<Response | undefined>;
}

/**
 * Options shared by every OpenAPI handler.
 * @since 12.0.0-alpha.0
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
  plugins?: ReadonlyArray<OpenApiPlugin>;
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
   * prefix (08 Q8.4).
   */
  contract?: ContractJson<TRouter>;
}

/**
 * The options of {@link createOpenApiHandler}.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type OpenApiHandlerOptions<TRouter extends AnyRouter> =
  BaseOpenApiHandlerOptions<TRouter> &
    ContextOption<inferRouterContext<TRouter>> &
    LayerOption<inferRouterServices<TRouter>>;

/**
 * A web-standard handler for the REST mapping of a router.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface OpenApiHandler {
  fetch(request: Request): Promise<Response>;
  /** Releases the `layer`'s resources. */
  dispose(): Promise<void>;
}

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

const isForm = (type: string | null) =>
  type !== null &&
  /^(application\/x-www-form-urlencoded|multipart\/form-data)\b/i.test(type);

/** Static segments before params, so `/posts/latest` wins over `/posts/{id}`. */
const specificity = (route: ResolvedRoute) =>
  route.path
    .split('/')
    .map((s) => (s.startsWith('{') ? '1' : '0'))
    .join('');

/**
 * Serves a router over REST (18 O-A): each procedure at its `.route()` (or
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
 *   plugins: [openApiReference({ specGenerateOptions: { info: { title: 'API', version: '1.0.0' } } })],
 * });
 * // GET /api/posts/1, GET /api/docs, GET /api/openapi.json
 * ```
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export function createOpenApiHandler<TRouter extends AnyRouter>(
  opts: OpenApiHandlerOptions<TRouter>,
): OpenApiHandler {
  const base = createHandlerCore(
    opts as typeof opts & {
      createContext?: (o: CreateContextOpts) => MaybePromise<object>;
      layer?: Layer.Layer<any, any, never>;
    },
  );
  const prefix = normalizePrefix(opts.prefix);
  const maxBodySize = opts.maxBodySize ?? 1_048_576;
  const ssePingMs = opts.sse?.pingMs ?? 15_000;
  const plugins = opts.plugins ?? [];

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
      list = flat.procedures.map(({ path, procedure, scope }) => {
        const def = procedure['~trpc'];
        return makeEntry(
          path,
          def.type,
          scopedRoute(path, def.route, scope),
          inputJsonSchema(def),
          () => procedure,
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

  const fail = (err: AnyTrpcError, headers?: Headers) =>
    json(err.status, toOpenApiError(base.publicError(err)), headers);

  async function readBody(request: Request): Promise<{
    value: unknown;
    fromStrings: boolean;
  }> {
    const length = Number(request.headers.get('content-length') ?? 0);
    if (length > maxBodySize) {
      throw new TrpcError({
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request body is too large',
      });
    }
    const type = request.headers.get('content-type');
    if (isForm(type)) {
      const form = await request.formData();
      return {
        value: parseBracketNotation(
          form as unknown as Iterable<[string, string]>,
        ),
        fromStrings: true,
      };
    }
    const text = await request.text();
    if (encoder.encode(text).byteLength > maxBodySize) {
      throw new TrpcError({
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request body is too large',
      });
    }
    if (text === '') return { value: undefined, fromStrings: false };
    if (!isJsonContentType(type)) {
      throw new TrpcError({
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message:
          'Bodies must be application/json, application/x-www-form-urlencoded or multipart/form-data',
      });
    }
    try {
      return { value: JSON.parse(text), fromStrings: false };
    } catch (cause) {
      throw new TrpcError({
        code: 'PARSE_ERROR',
        message: 'Invalid JSON',
        cause,
      });
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
      throw new TrpcError({
        code: 'BAD_REQUEST',
        message: 'A route with path params needs an object body',
      });
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
        headers.set(
          'content-disposition',
          `inline; filename="${encodeURIComponent(body.name)}"`,
        );
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
    const body = new ReadableStream<Uint8Array>({
      async start(sink) {
        const write = (text: string) => {
          if (!controller.signal.aborted) sink.enqueue(encoder.encode(text));
        };
        // Flushes headers on servers that hold them until the first chunk.
        write(': open\n\n');
        const ping =
          ssePingMs === false
            ? undefined
            : setInterval(() => write(': ping\n\n'), ssePingMs);
        const exit = await Effect.runPromiseExit(
          Stream.runForEach(stream, (event) =>
            Effect.sync(() => {
              const [id, data] = isTracked(event)
                ? [`id: ${event.id}\n`, event.data]
                : ['', event];
              write(`${id}event: message\ndata: ${JSON.stringify(data)}\n\n`);
            }),
          ),
          { signal: controller.signal },
        ).finally(() => clearInterval(ping));
        if (controller.signal.aborted) return;
        if (Exit.isFailure(exit)) {
          const err = normalizeCause(exit.cause);
          base.report(err, request, entry.path, 'subscription');
          write(
            `event: error\ndata: ${JSON.stringify(toOpenApiError(base.publicError(err)))}\n\n`,
          );
        } else {
          write('event: done\ndata: \n\n');
        }
        sink.close();
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
      throw new TrpcError({
        code: 'NOT_FOUND',
        message: `The contract's "${entry.path}" is not in the router`,
      });
    }
    const input = await readInput(request, url, entry, params);
    const ctx = await base.makeContext({
      request,
      calls: [{ path: entry.path, type }],
    });
    const controller = new AbortController();
    request.signal.addEventListener('abort', () => controller.abort(), {
      once: true,
    });
    const response = createResponseHandle();
    const exit = await base.run({
      procedure,
      path: entry.path,
      ctx,
      input,
      signal: controller.signal,
      response,
      lastEventId: request.headers.get('last-event-id') ?? undefined,
    });
    if (Exit.isFailure(exit)) {
      const err = normalizeCause(exit.cause);
      base.report(err, request, entry.path, type);
      return fail(err, response.headers);
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
    return output(
      entry,
      exit.value,
      response.status ?? entry.route.successStatus,
      response.headers,
    );
  }

  return {
    async fetch(request) {
      const url = new URL(request.url);
      try {
        if (startup) {
          await startup;
          startup = undefined;
        }
        await loadFor(url.pathname);
        for (const plugin of plugins) {
          const answer = await plugin.fetch?.(request, {
            router: opts.router,
            prefix,
          });
          if (answer) return answer;
        }
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
            base.report(err, request, entry.path, entry.type);
            return fail(err);
          }
        }
        throw new TrpcError(
          allowed
            ? {
                code: 'METHOD_NOT_SUPPORTED',
                message: `${request.method} is not supported for ${url.pathname}`,
              }
            : { code: 'NOT_FOUND', message: `Not found: ${url.pathname}` },
        );
      } catch (cause) {
        const err = isTrpcError(cause) ? cause : unexpectedError(cause);
        base.report(err, request);
        return fail(err);
      }
    },
    dispose: base.dispose,
  };
}
