import { Effect, Stream } from 'effect';
import type { Operation, OperationStream, TrpcLink } from '../client/link.ts';
import type { ContractJson } from '../contract/index.ts';
import {
  codeOfStatus,
  isTrpcError,
  TrpcError,
  type AnyTrpcError,
} from '../internal/error.ts';
import { parseSse } from '../internal/protocol.ts';
import type { JsonForm } from '../internal/types.ts';
import { experimental_toBracketNotation } from './bracket.ts';
import { fromOpenApiError } from './errors.ts';
import {
  fillPath,
  normalizePrefix,
  experimental_resolveRoute,
  usesQuery,
  type ResolvedRoute,
} from './routes.ts';

/**
 * The options of {@link experimental_openApiLink}.
 * @since 0.1.0
 * @stability experimental
 */
export interface OpenApiLinkOptions {
  /** The server's origin (and any base path), without the handler prefix. */
  url: string | URL;
  /** Methods and paths for each procedure: from `toContract()`. */
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
  fetch?: typeof globalThis.fetch;
}

const isAbort = (cause: unknown) =>
  cause instanceof Error && cause.name === 'AbortError';

const toError = (cause: unknown): AnyTrpcError =>
  isTrpcError(cause)
    ? cause
    : new TrpcError(
        isAbort(cause)
          ? {
              code: 'CLIENT_CLOSED_REQUEST',
              message: 'The request was aborted',
              cause,
            }
          : {
              code: 'NETWORK_ERROR',
              message: cause instanceof Error ? cause.message : 'Network error',
              cause,
            },
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
 * import contract from './contract.json' with { type: 'json' }; // toContract(appRouter)
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
export function experimental_openApiLink(
  opts: OpenApiLinkOptions,
): TrpcLink<{ form: JsonForm }> {
  const base = String(opts.url).replace(/\/+$/, '');
  const prefix = normalizePrefix(opts.prefix);
  const fetchFn = opts.fetch ?? globalThis.fetch;
  const routes = new Map<string, ResolvedRoute>();
  const routeOf = (op: Operation): ResolvedRoute => {
    let route = routes.get(op.path);
    if (!route) {
      const procedure = opts.contract.procedures[op.path];
      if (!procedure) {
        throw new TrpcError({
          code: 'NOT_FOUND',
          message: `"${op.path}" is not in the contract`,
        });
      }
      route = experimental_resolveRoute(
        op.path,
        procedure.type,
        procedure.route,
        prefix,
      );
      routes.set(op.path, route);
    }
    return route;
  };

  async function request(
    op: Operation,
    signal: AbortSignal,
  ): Promise<Response> {
    const route = routeOf(op);
    const headers = new Headers(
      typeof opts.headers === 'function'
        ? await opts.headers({ op })
        : opts.headers,
    );
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
    return fetchFn(url, {
      method: route.method,
      headers,
      ...(payload === undefined ? {} : { body: payload }),
      signal,
    });
  }

  async function readError(res: Response): Promise<AnyTrpcError> {
    const text = await res.text();
    try {
      return fromOpenApiError(JSON.parse(text), res.status);
    } catch (cause) {
      return new TrpcError({
        code: codeOfStatus(res.status) ?? 'BAD_RESPONSE',
        message: `Unexpected ${res.status} response`,
        cause,
      });
    }
  }

  async function readResult(op: Operation, res: Response): Promise<unknown> {
    if (!res.ok) throw await readError(res);
    const type = res.headers.get('content-type') ?? '';
    const value = /^application\/json\b/i.test(type)
      ? await res.json()
      : res.status === 204 || res.headers.get('content-length') === '0'
        ? undefined
        : type
          ? await res.blob()
          : (await res.text()) || undefined;
    if (routeOf(op).outputStructure !== 'detailed') return value;
    return {
      status: res.status,
      headers: Object.fromEntries(res.headers),
      body: value,
    };
  }

  const linked = (signal: AbortSignal, op: Operation) =>
    op.signal ? AbortSignal.any([signal, op.signal]) : signal;

  async function* events(op: Operation, signal: AbortSignal) {
    const res = await request(op, signal);
    if (!res.ok || !res.body) throw await readError(res);
    for await (const event of parseSse(res.body)) {
      if (event.event === 'done') return;
      if (event.event === 'error') {
        throw fromOpenApiError(JSON.parse(event.data), res.status);
      }
      const data: unknown = JSON.parse(event.data);
      yield event.id === undefined ? data : { id: event.id, data };
    }
  }

  return ({ op }): OperationStream => {
    if (op.type !== 'subscription') {
      return Stream.fromEffect(
        Effect.tryPromise({
          try: async (signal) =>
            readResult(op, await request(op, linked(signal, op))),
          catch: toError,
        }),
      );
    }
    return Stream.unwrap(
      Effect.sync(() => {
        const controller = new AbortController();
        return Stream.fromAsyncIterable(
          events(op, linked(controller.signal, op)),
          toError,
        ).pipe(Stream.ensuring(Effect.sync(() => controller.abort())));
      }),
    );
  };
}
