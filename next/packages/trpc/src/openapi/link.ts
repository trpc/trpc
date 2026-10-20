import { Effect, Stream, type Scope } from 'effect';
import {
  link,
  type BuiltinCallOptions,
  type Operation,
  type OperationStream,
  type TrpcLink,
} from '../client/link.ts';
import type { ContractJson } from '../contract/index.ts';
import {
  codeOfStatus,
  isTrpcError,
  TrpcError,
  type AnyTrpcError,
} from '../internal/error.ts';
import { sseEvents } from '../internal/protocol.ts';
import type { JsonForm } from '../internal/types.ts';
import {
  experimental_toBracketNotation,
  fromOpenApiError,
  fillPath,
  normalizePrefix,
  experimental_resolveRoute,
  usesQuery,
  type ResolvedRoute,
} from './rest/index.ts';

/**
 * The options of {@link experimental_openApiLink}.
 * @since 0.1.0
 * @stability experimental
 */
export interface OpenApiLinkOptions {
  /** The server's origin (and any base path), without the handler prefix. */
  url: string | URL;
  /** Methods and paths for each procedure: from `experimental_toContract()`. */
  contract: ContractJson<any>;
  /**
   * The handler's prefix.
   * @default '/api'
   */
  prefix?: string;
  /** Extra headers, merged with each call's `context.headers`. */
  headers?:
    | HeadersInit
    | ((opts: { op: Operation }) => HeadersInit | Promise<HeadersInit>);
  /** A custom `fetch`, called with the URL as a string. */
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
}

const isAbort = (cause: unknown) =>
  cause instanceof Error && cause.name === 'AbortError';

const toError = (cause: unknown): AnyTrpcError => {
  if (isTrpcError(cause)) return cause;
  if (isAbort(cause)) {
    return new TrpcError.ClientClosedRequest({
      message: 'The request was aborted',
      cause,
    });
  }
  return new TrpcError.NetworkError({
    message: cause instanceof Error ? cause.message : 'Network error',
    cause,
  });
};

const parseJson = (text: string): Effect.Effect<unknown, AnyTrpcError> =>
  Effect.try({ try: (): unknown => JSON.parse(text), catch: toError });

/** A response that isn't a result, as the error its body describes. */
const readError = (res: Response): Effect.Effect<never, AnyTrpcError> =>
  Effect.tryPromise({ try: () => res.text(), catch: toError }).pipe(
    Effect.flatMap((text) =>
      Effect.try({
        try: () => fromOpenApiError(JSON.parse(text), res.status),
        catch: (cause) =>
          new TrpcError({
            code: codeOfStatus(res.status) ?? 'BAD_RESPONSE',
            message: `Unexpected ${res.status} response`,
            cause,
          }),
      }),
    ),
    Effect.flatMap(Effect.fail),
  );

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' &&
  v !== null &&
  Object.getPrototypeOf(v) === Object.prototype;

const hasBlob = (value: unknown): boolean =>
  value instanceof Blob ||
  (Array.isArray(value) && value.some(hasBlob)) ||
  (isPlainObject(value) && Object.values(value).some(hasBlob));

/**
 * Calls a router's REST mapping (18 (d)): the endpoints
 * `experimental_createOpenApiHandler` serves, at the methods and paths of a JSON
 * contract. Inputs become path params, bracket-notation query strings or
 * JSON bodies (`multipart/form-data` when they contain a `Blob`), and
 * subscriptions read `text/event-stream`. Works with any server that
 * implements the same OpenAPI document.
 *
 * @example
 * ```ts
 * import contract from './contract.json' with { type: 'json' }; // experimental_toContract(appRouter)
 *
 * const client = createTrpcClient({
 *   router: routerType<AppRouter>(),
 *   links: [experimental_openApiLink({ url: 'https://api.example.com', contract })],
 * });
 * await client.post.byId.query({ id: '1' }); // GET https://api.example.com/api/posts/1
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export function experimental_openApiLink(opts: OpenApiLinkOptions): TrpcLink<{
  context: Pick<BuiltinCallOptions, 'headers'>;
  form: JsonForm;
  builtinErrors: 'NETWORK_ERROR' | 'BAD_RESPONSE';
}> {
  const base = String(opts.url).replace(/\/+$/, '');
  const prefix = normalizePrefix(opts.prefix);
  const fetchFn = opts.fetch ?? globalThis.fetch;
  const routes = new Map<string, ResolvedRoute>();
  const routeOf = (op: Operation): Effect.Effect<ResolvedRoute, AnyTrpcError> =>
    Effect.suspend(() => {
      const cached = routes.get(op.path);
      if (cached) return Effect.succeed(cached);
      const procedure = opts.contract.procedures[op.path];
      if (!procedure) {
        return Effect.fail(
          new TrpcError.NotFound({
            message: `"${op.path}" is not in the contract`,
          }),
        );
      }
      return Effect.sync(() => {
        const route = experimental_resolveRoute(
          op.path,
          procedure.type,
          procedure.route,
          prefix,
        );
        routes.set(op.path, route);
        return route;
      });
    });

  const extraHeaders = (
    op: Operation,
  ): Effect.Effect<HeadersInit | undefined, AnyTrpcError> => {
    const headers = opts.headers;
    return typeof headers === 'function'
      ? Effect.tryPromise({ try: async () => headers({ op }), catch: toError })
      : Effect.succeed(headers);
  };

  /**
   * Sends the call. The request aborts when the scope closes, so the
   * response body reads within it.
   */
  const send = Effect.fnUntraced(function* (
    op: Operation,
    route: ResolvedRoute,
  ): Effect.fn.Return<Response, AnyTrpcError, Scope.Scope> {
    const init = yield* extraHeaders(op);
    const built = yield* Effect.try({
      try: () => build(op, route, new Headers(init)),
      catch: toError,
    });
    const controller = yield* Effect.acquireRelease(
      Effect.sync(() => new AbortController()),
      (controller) => Effect.sync(() => controller.abort()),
    );
    const signal = op.signal
      ? AbortSignal.any([controller.signal, op.signal])
      : controller.signal;
    return yield* Effect.tryPromise({
      try: () => fetchFn(built.url, { ...built.request, signal }),
      catch: toError,
    });
  });

  function build(
    op: Operation,
    route: ResolvedRoute,
    headers: Headers,
  ): { url: string; request: RequestInit } {
    new Headers(op.context.headers).forEach((v, k) => headers.set(k, v));
    let input = op.input;
    let params: Record<string, unknown> = {};
    let query: unknown;
    let body: unknown;
    if (route.inputStructure === 'detailed') {
      const d = (input ?? {}) as {
        params?: Record<string, unknown>;
        query?: unknown;
        headers?: Record<string, string>;
        body?: unknown;
      };
      params = d.params ?? {};
      query = d.query;
      body = d.body;
      for (const [k, v] of Object.entries(d.headers ?? {})) headers.set(k, v);
    } else {
      if (route.params.length > 0 && isPlainObject(input)) {
        params = input;
        input = Object.fromEntries(
          Object.entries(input).filter(([k]) => !route.params.includes(k)),
        );
      }
      if (usesQuery(route.method)) query = input;
      else body = input;
    }
    let url = `${base}${fillPath(route.path, params)}`;
    const search = new URLSearchParams(
      experimental_toBracketNotation(query) as Array<[string, string]>,
    ).toString();
    if (search) url += `?${search}`;
    if (op.type === 'subscription') {
      headers.set('accept', 'text/event-stream');
      if (op.lastEventId) headers.set('last-event-id', op.lastEventId);
    }
    let payload: BodyInit | undefined;
    if (body !== undefined && !usesQuery(route.method)) {
      if (hasBlob(body)) {
        const form = new FormData();
        for (const [k, v] of experimental_toBracketNotation(body))
          form.append(k, v);
        payload = form;
      } else {
        headers.set('content-type', 'application/json');
        payload = JSON.stringify(body);
      }
    }
    return {
      url,
      request: {
        method: route.method,
        headers,
        ...(payload === undefined ? {} : { body: payload }),
      },
    };
  }

  const single = Effect.fnUntraced(function* (
    op: Operation,
  ): Effect.fn.Return<unknown, AnyTrpcError, Scope.Scope> {
    const route = yield* routeOf(op);
    const res = yield* send(op, route);
    if (!res.ok) return yield* readError(res);
    const type = res.headers.get('content-type') ?? '';
    const value = yield* Effect.tryPromise({
      try: async (): Promise<unknown> =>
        /^application\/json\b/i.test(type)
          ? res.json()
          : res.status === 204 || res.headers.get('content-length') === '0'
            ? undefined
            : type
              ? res.blob()
              : (await res.text()) || undefined,
      catch: toError,
    });
    if (route.outputStructure !== 'detailed') return value;
    return {
      status: res.status,
      headers: Object.fromEntries(res.headers),
      body: value,
    };
  }, Effect.scoped);

  const subscription = Effect.fnUntraced(function* (
    op: Operation,
  ): Effect.fn.Return<OperationStream, AnyTrpcError, Scope.Scope> {
    const res = yield* send(op, yield* routeOf(op));
    const body = res.body;
    if (!res.ok || !body) return yield* readError(res);
    return sseEvents(
      Stream.fromReadableStream({ evaluate: () => body, onError: toError }),
    ).pipe(
      Stream.takeWhile((event) => event.event !== 'done'),
      // Not `Stream.mapEffect`, whose concurrent machinery is 2.3 kB of
      // this link.
      Stream.mapAccumEffect(
        () => undefined,
        (state, event) =>
          Effect.flatMap(parseJson(event.data), (data) =>
            event.event === 'error'
              ? Effect.fail(fromOpenApiError(data, res.status))
              : Effect.succeed([
                  state,
                  [event.id === undefined ? data : { id: event.id, data }],
                ] as const),
          ),
      ),
    );
  });

  return link(({ op }): OperationStream =>
    op.type === 'subscription'
      ? Stream.unwrap(subscription(op))
      : Stream.fromEffect(single(op)),
  );
}
