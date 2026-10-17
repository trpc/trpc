import { Cause, Context, Effect, Exit, Stream, type Layer } from 'effect';
import {
  HttpEffect,
  HttpServerRequest,
  HttpServerResponse,
  type HttpMiddleware,
} from 'effect/http';
import {
  isTrpcError,
  statusOf,
  TrpcError,
  type AnyTrpcError,
} from '../internal/error.ts';
import {
  isJsonContentType,
  isMultipartContentType,
} from '../internal/protocol.ts';
import type { MaybePromise, ProcedureType } from '../internal/types.ts';
import { parseBracketNotation } from '../openapi/bracket.ts';
import { isAsyncIterable, isPromiseLike } from '../serializer/stream.ts';
import { isPlainObject } from '../serializer/utils.ts';
import { readBytes, responseOptions } from '../server/body.ts';
import { createHandlerCore, type HandlerCore } from '../server/core.ts';
import {
  createResponseHandle,
  normalizeCause,
  unexpectedError,
} from '../server/execute.ts';
import {
  CurrentPlatform,
  httpApps,
  parentSpan,
  type ContextOption,
  type CreateContextOpts,
  type LayerOption,
  type OnErrorOpts,
  type PlatformArgs,
  type PlatformField,
} from '../server/fetch.ts';
import type { AnyProcedure } from '../server/procedure.ts';
import {
  resolveProcedure,
  type AnyRouter,
  type inferRouterContext,
  type inferRouterServices,
} from '../server/router.ts';
import type { WebSocketLike } from '../server/socket.ts';
import { isTracked } from '../server/tracked.ts';
import {
  v11Shape,
  type V11ErrorFormatterOpts,
  type V11ErrorShape,
} from './errors.ts';
import { jsonlLines } from './jsonl.ts';
import { inputEventId, serveV11Socket } from './socket.ts';

/**
 * A v11 data transformer: `superjson`, or anything with `serialize` and
 * `deserialize`. Must match the old clients'.
 * @since 0.1.0
 * @stability stable
 */
export interface V11Transformer {
  serialize(value: any): any;
  deserialize(value: any): any;
}

/**
 * One transformer, or v11's separate `input` and `output` ones.
 * @since 0.1.0
 * @stability stable
 */
export type V11TransformerOption =
  | V11Transformer
  | { readonly input: V11Transformer; readonly output: V11Transformer };

/**
 * Options shared by every {@link createV11Handler}.
 * @since 0.1.0
 * @stability stable
 */
export interface BaseV11HandlerOptions<TRouter extends AnyRouter> {
  router: TRouter;
  /**
   * The path prefix the old clients call, their links' `url` path.
   * @default '/trpc'
   */
  endpoint?: string;
  /** The transformer the old clients' links use, e.g. `superjson`. */
  transformer?: V11TransformerOption;
  /**
   * Turns the default v11 shape into the one the old clients expect: what
   * the v11 router's `errorFormatter` returned. `error` is the v12 error,
   * with its `data` and `cause`.
   * @example
   * ```ts
   * errorFormatter: ({ shape, error }) => ({
   *   ...shape,
   *   data: { ...shape.data, issues: error.code === 'BAD_REQUEST' ? error.data : null },
   * }),
   * ```
   */
  errorFormatter?: (opts: V11ErrorFormatterOpts) => V11ErrorShape;
  /**
   * Accept `httpBatchLink` and `httpBatchStreamLink` batches, as v11 does
   * by default, of at most `maxItems` calls (v11 had no cap).
   * @default { maxItems: 100 }
   */
  batch?: boolean | { maxItems?: number };
  /** Accept POST for queries and subscriptions (v11's `methodOverride: 'POST'`). */
  allowMethodOverride?: boolean;
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
  /** Effect HTTP middleware around the handler, outermost first. */
  middleware?: ReadonlyArray<HttpMiddleware.HttpMiddleware>;
  sse?: {
    /**
     * Send a v11 `ping` event this often while a subscription is quiet.
     * `false` sends none.
     * @default 15_000
     */
    pingMs?: number | false;
  };
  websocket?: {
    /**
     * Close a WebSocket that sends nothing, `wsLink`'s keep-alive pings
     * included, for this long. `false` keeps silent sockets open.
     * @default false
     */
    idleTimeoutMs?: number | false;
  };
}

/**
 * The options of {@link createV11Handler}.
 * @since 0.1.0
 * @stability stable
 */
export type V11HandlerOptions<
  TRouter extends AnyRouter,
  TPlatform = undefined,
> = BaseV11HandlerOptions<TRouter> &
  ContextOption<inferRouterContext<TRouter>, TPlatform> &
  LayerOption<inferRouterServices<TRouter>>;

/**
 * A handler that serves v11 clients.
 * @since 0.1.0
 * @stability stable
 */
export interface V11Handler<TPlatform = undefined> {
  /** Handles one HTTP request from a v11 HTTP link. */
  readonly fetch: (
    request: Request,
    ...platform: PlatformArgs<TPlatform>
  ) => Promise<Response>;
  /** Serves a v11 `wsLink` over an accepted WebSocket. */
  websocket(
    socket: WebSocketLike,
    opts: { request: Request } & PlatformField<TPlatform>,
  ): void;
  /** Releases the `layer`'s resources. */
  dispose(): Promise<void>;
}

/** What the HTTP and WebSocket sides share. @internal */
export interface V11Core {
  readonly router: AnyRouter;
  readonly base: HandlerCore;
  readonly input: V11Transformer;
  readonly output: V11Transformer;
  readonly errorShape: (
    err: AnyTrpcError,
    path: string | undefined,
    type: ProcedureType | 'unknown',
    procedure?: AnyProcedure,
  ) => V11ErrorShape;
  /** A query's or mutation's output with its promises settled. */
  readonly settle: (value: unknown) => Effect.Effect<unknown, AnyTrpcError>;
}

interface Call {
  readonly path: string;
  readonly procedure: AnyProcedure | undefined;
  readonly type: ProcedureType | 'unknown';
}

type Outcome =
  | {
      readonly ok: true;
      readonly data: unknown;
      readonly status: number | undefined;
      readonly headers: Headers;
      readonly response?: HttpServerResponse.HttpServerResponse;
    }
  | {
      readonly ok: false;
      readonly error: AnyTrpcError;
      readonly headers?: Headers;
    };

const decoder = new TextDecoder();
const identity: V11Transformer = { serialize: (v) => v, deserialize: (v) => v };

const fail = (code: string, message: string) =>
  Effect.fail(new TrpcError({ code, message }));

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

const streamOutputError = () =>
  new TrpcError({
    code: 'UNSUPPORTED_MEDIA_TYPE',
    message:
      'Cannot use stream-like response in non-streaming request - use httpBatchStreamLink',
  });

const settleOne = (value: unknown): Effect.Effect<unknown, AnyTrpcError> => {
  if (isAsyncIterable(value) || Stream.isStream(value)) {
    return Effect.fail(streamOutputError());
  }
  if (!isPromiseLike(value)) return Effect.succeed(value);
  return Effect.tryPromise({
    try: () => Promise.resolve(value),
    catch: (cause) => (isTrpcError(cause) ? cause : unexpectedError(cause)),
  });
};

/** Settles the root and top-level-key promises, the ones v11's JSON Lines could carry. */
const settle = (value: unknown): Effect.Effect<unknown, AnyTrpcError> =>
  Effect.flatMap(settleOne(value), (root) =>
    isPlainObject(root)
      ? Effect.map(
          Effect.forEach(
            Object.entries(root),
            ([key, item]) =>
              Effect.map(settleOne(item), (v) => [key, v] as const),
            { concurrency: 'unbounded' },
          ),
          Object.fromEntries,
        )
      : Effect.succeed(root),
  );

const parseJson = (text: string) =>
  Effect.try({
    try: () => (text === '' ? undefined : (JSON.parse(text) as unknown)),
    catch: (cause) =>
      new TrpcError({ code: 'PARSE_ERROR', message: 'Invalid JSON', cause }),
  });

/** Aborted when the fiber handling the request is interrupted (the client left). */
const callSignal = Effect.acquireRelease(
  Effect.sync(() => new AbortController()),
  (controller, exit) =>
    Exit.hasInterrupts(exit)
      ? Effect.sync(() => controller.abort())
      : Effect.void,
);

const abortOnInterrupt =
  (controller: AbortController) =>
  <A, E>(stream: Stream.Stream<A, E>): Stream.Stream<A, E> =>
    Stream.onExit(stream, (exit) =>
      Exit.hasInterrupts(exit)
        ? Effect.sync(() => controller.abort())
        : Effect.void,
    );

/**
 * Serves a v12 router to v11 clients (`@trpc/client` 11), so the server
 * can deploy before every client updates: `httpLink`, `httpBatchLink`,
 * `httpBatchStreamLink`, `httpSubscriptionLink` and `wsLink`, with v11's
 * JSON-RPC error shape and an optional v11 `transformer`. Serve it next to
 * the v12 handler, on the endpoint the old clients call.
 *
 * Inputs reach the v12 procedures as the old client sent them (after the
 * transformer); outputs go out as v11 sent them: `JSON.stringify` after
 * the transformer's `serialize`. Deferred values stream to
 * `httpBatchStreamLink` at the root or at a top-level key of an output, as
 * v11 streamed them; other links get settled promises.
 *
 * @example
 * ```ts
 * import superjson from 'superjson';
 * import { createV11Handler } from '@trpc12/trpc/interop';
 *
 * const legacy = createV11Handler({ router: appRouter, createContext, transformer: superjson });
 * const handler = createFetchHandler({ router: appRouter, createContext, endpoint: '/rpc' });
 * export default {
 *   fetch: (request: Request) =>
 *     new URL(request.url).pathname.startsWith('/trpc/') ? legacy.fetch(request) : handler.fetch(request),
 * };
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function createV11Handler<
  TRouter extends AnyRouter,
  TPlatform = undefined,
>(opts: V11HandlerOptions<TRouter, TPlatform>): V11Handler<TPlatform> {
  const base = createHandlerCore(
    opts as typeof opts & {
      createContext?: (o: CreateContextOpts<any>) => MaybePromise<object>;
      layer?: Layer.Layer<any, any, never>;
    },
  );
  const { publicError, report } = base;
  const transformer = opts.transformer;
  const input =
    transformer === undefined
      ? identity
      : 'input' in transformer
        ? transformer.input
        : transformer;
  const output =
    transformer === undefined
      ? identity
      : 'output' in transformer
        ? transformer.output
        : transformer;
  const endpoint = `/${(opts.endpoint ?? '/trpc').replace(/^\/+|\/+$/g, '')}`;
  const maxBodySize = opts.maxBodySize ?? 1_048_576;
  const ssePingMs = opts.sse?.pingMs ?? 15_000;
  const batch =
    opts.batch === false
      ? undefined
      : {
          maxItems:
            (typeof opts.batch === 'object'
              ? opts.batch.maxItems
              : undefined) ?? 100,
        };

  const errorShape: V11Core['errorShape'] = (err, path, type, procedure) => {
    const error = publicError(err);
    const shape = v11Shape(error, path, procedure?.['~trpc'].errors);
    return opts.errorFormatter?.({ error, shape, path, type }) ?? shape;
  };
  const core: V11Core = {
    router: opts.router,
    base,
    input,
    output,
    errorShape,
    settle,
  };

  const json = (
    status: number,
    body: string,
    set?: Headers,
  ): HttpServerResponse.HttpServerResponse => {
    const options = responseOptions(set);
    return HttpServerResponse.text(body, {
      status,
      contentType: 'application/json',
      ...(options.headers ? { headers: options.headers } : {}),
      ...(options.cookies ? { cookies: options.cookies } : {}),
    });
  };

  /** The transformed body of one call's outcome, as JSON text. */
  const callBody = (
    request: HttpServerRequest.HttpServerRequest,
    call: Call,
    outcome: Outcome,
  ): Effect.Effect<{ status: number; text: string }> => {
    const failed = (err: AnyTrpcError) => {
      report(
        err,
        request,
        call.path,
        call.type === 'unknown' ? undefined : call.type,
      );
      return {
        status: statusOf(publicError(err), call.procedure?.['~trpc'].errors),
        text: JSON.stringify({
          error: output.serialize(
            errorShape(err, call.path, call.type, call.procedure),
          ),
        }),
      };
    };
    if (!outcome.ok) return Effect.succeed(failed(outcome.error));
    return settle(outcome.data).pipe(
      Effect.flatMap((data) =>
        Effect.try({
          try: () =>
            JSON.stringify({ result: { data: output.serialize(data) } }),
          catch: unexpectedError,
        }),
      ),
      Effect.match({
        onSuccess: (text) => ({ status: outcome.status ?? 200, text }),
        onFailure: failed,
      }),
    );
  };

  /** The raw input: JSON from the query string or body, else a form or bytes. */
  const readRaw = (
    request: HttpServerRequest.HttpServerRequest,
    url: URL,
    isBatch: boolean,
  ): Effect.Effect<{ value: unknown; json: boolean }, AnyTrpcError> =>
    Effect.gen(function* () {
      if (request.method === 'GET') {
        const query = url.searchParams.get('input');
        return {
          value: query === null ? undefined : yield* parseJson(query),
          json: true,
        };
      }
      const type = request.headers['content-type'] ?? null;
      const multipart = isMultipartContentType(type);
      const octet = type !== null && /^application\/octet-stream\b/i.test(type);
      if ((multipart || octet) && isBatch) {
        return yield* fail('BAD_REQUEST', `${type} requests cannot be batched`);
      }
      // v11 clients send no custom header, so cross-site bodies a form or a
      // no-cors fetch can send (multipart, or none at all) are refused by origin.
      if (
        (multipart || type === null) &&
        request.headers['sec-fetch-site'] === 'cross-site'
      ) {
        return yield* fail(
          'FORBIDDEN',
          'Cross-site requests must have content-type: application/json',
        );
      }
      if (type !== null && !multipart && !octet && !isJsonContentType(type)) {
        return yield* fail(
          'UNSUPPORTED_MEDIA_TYPE',
          `Unsupported content-type "${type}"`,
        );
      }
      const bytes = yield* readBytes(request, maxBodySize);
      if (octet)
        return { value: new Blob([bytes as BlobPart], { type }), json: false };
      if (multipart) {
        const form = yield* Effect.tryPromise({
          try: () =>
            new Response(bytes as BodyInit, {
              headers: { 'content-type': type ?? '' },
            }).formData(),
          catch: (cause) =>
            new TrpcError({
              code: 'PARSE_ERROR',
              message: 'Invalid multipart body',
              cause,
            }),
        });
        return {
          value: parseBracketNotation(
            form as unknown as Iterable<[string, string | Blob]>,
          ),
          json: false,
        };
      }
      return { value: yield* parseJson(decoder.decode(bytes)), json: true };
    });

  const deserialize = (value: unknown) =>
    value === undefined
      ? Effect.succeed(undefined)
      : Effect.try({
          try: () => input.deserialize(value) as unknown,
          catch: (cause) =>
            new TrpcError({
              code: 'BAD_REQUEST',
              message: cause instanceof Error ? cause.message : 'Invalid input',
              cause,
            }),
        });

  /** One input per call. */
  const readInputs = (
    request: HttpServerRequest.HttpServerRequest,
    url: URL,
    isBatch: boolean,
    count: number,
  ): Effect.Effect<ReadonlyArray<unknown>, AnyTrpcError> =>
    Effect.gen(function* () {
      const raw = yield* readRaw(request, url, isBatch);
      if (!raw.json) return [raw.value];
      if (!isBatch) return [yield* deserialize(raw.value)];
      if (raw.value === undefined) return Array.from({ length: count });
      const inputs = raw.value;
      if (!isRecord(inputs)) {
        return yield* fail(
          'BAD_REQUEST',
          '"input" needs to be an object when doing a batch call',
        );
      }
      return yield* Effect.forEach(
        Array.from({ length: count }, (_, i) => inputs[i]),
        deserialize,
      );
    });

  const run = (
    request: HttpServerRequest.HttpServerRequest,
    call: Call,
    ctx: object,
    callInput: unknown,
    signal: AbortSignal,
    single: boolean,
  ): Effect.Effect<Outcome> =>
    Effect.gen(function* () {
      if (!call.procedure) {
        return {
          ok: false,
          error: new TrpcError({
            code: 'NOT_FOUND',
            message: `No procedure found on path "${call.path}"`,
          }),
        } as const;
      }
      if (call.type === 'subscription') {
        return {
          ok: false,
          error: new TrpcError({
            code: 'BAD_REQUEST',
            message: 'Subscriptions cannot be batched',
          }),
        } as const;
      }
      const procedure = call.procedure;
      const response = createResponseHandle();
      const parent = yield* parentSpan(request);
      const exit = yield* Effect.promise((_interrupted) =>
        base.run({
          request,
          procedure,
          path: call.path,
          ctx,
          input: callInput,
          signal,
          response,
          allowResponse: single,
          parent,
        }),
      );
      if (Exit.isFailure(exit)) {
        return {
          ok: false,
          error: normalizeCause(exit.cause),
          headers: response.headers,
        } as const;
      }
      return HttpServerResponse.isHttpServerResponse(exit.value)
        ? {
            ok: true,
            data: undefined,
            status: response.status,
            headers: response.headers,
            response: exit.value,
          }
        : {
            ok: true,
            data: exit.value,
            status: response.status,
            headers: response.headers,
          };
    });

  const subscription = (
    request: HttpServerRequest.HttpServerRequest,
    url: URL,
    call: Call & { procedure: AnyProcedure },
    ctx: object,
    callInput: unknown,
    controller: AbortController,
  ) =>
    Effect.gen(function* () {
      const lastEventId =
        request.headers['last-event-id'] ??
        url.searchParams.get('lastEventId') ??
        url.searchParams.get('Last-Event-Id') ??
        inputEventId(callInput);
      const response = createResponseHandle();
      const parent = yield* parentSpan(request);
      const exit = yield* Effect.promise((_interrupted) =>
        base.run({
          request,
          procedure: call.procedure,
          path: call.path,
          ctx,
          input: callInput,
          signal: controller.signal,
          response,
          lastEventId,
          parent,
        }),
      );
      const frame = (event: string | undefined, data: string, id?: string) =>
        `${event === undefined ? '' : `event: ${event}\n`}data: ${data}\n${id === undefined ? '' : `id: ${id}\n`}\n`;
      const errorFrame = (err: AnyTrpcError) => {
        report(err, request, call.path, 'subscription');
        return frame(
          'serialized-error',
          JSON.stringify(
            output.serialize(
              errorShape(err, call.path, 'subscription', call.procedure),
            ),
          ),
        );
      };
      const events: Stream.Stream<string, AnyTrpcError> = Exit.isFailure(exit)
        ? Stream.make(errorFrame(normalizeCause(exit.cause)))
        : (exit.value as Stream.Stream<unknown, AnyTrpcError>).pipe(
            Stream.map((event) =>
              isTracked(event)
                ? frame(
                    undefined,
                    JSON.stringify(output.serialize(event.data)),
                    event.id,
                  )
                : frame(undefined, JSON.stringify(output.serialize(event))),
            ),
            Stream.concat(Stream.make(frame('return', ''))),
            Stream.catchCause((cause) =>
              Cause.hasInterruptsOnly(cause)
                ? Stream.failCause(cause)
                : Stream.make(errorFrame(normalizeCause(cause))),
            ),
          );
      const frames = Stream.concat(
        Stream.make(frame('connected', '{}')),
        events,
      );
      const body =
        ssePingMs === false
          ? frames
          : Stream.merge(
              frames,
              Stream.tick(ssePingMs).pipe(
                Stream.drop(1),
                Stream.map(() => frame('ping', '')),
              ),
              { haltStrategy: 'left' },
            );
      const options = responseOptions(response.headers);
      const { headers } = options;
      return HttpServerResponse.stream(
        Stream.encodeText(body.pipe(abortOnInterrupt(controller))),
        {
          status: 200,
          contentType: 'text/event-stream',
          headers: {
            ...headers,
            'cache-control': 'no-cache, no-transform',
            'x-accel-buffering': 'no',
          },
          ...(options.cookies ? { cookies: options.cookies } : {}),
        },
      );
    });

  const serve = (
    request: HttpServerRequest.HttpServerRequest,
    url: URL,
    calls: ReadonlyArray<Call>,
    isBatch: boolean,
  ): Effect.Effect<HttpServerResponse.HttpServerResponse, AnyTrpcError> =>
    Effect.scoped(
      Effect.gen(function* () {
        const controller = yield* callSignal;
        const prepared = yield* Effect.exit(
          Effect.gen(function* () {
            const inputs = yield* readInputs(
              request,
              url,
              isBatch,
              calls.length,
            );
            const platform = yield* CurrentPlatform;
            const ctx = yield* Effect.tryPromise({
              try: () =>
                base.makeContext({
                  request,
                  platform,
                  calls: calls.flatMap((c) =>
                    c.type === 'unknown'
                      ? []
                      : [{ path: c.path, type: c.type }],
                  ),
                  signal: controller.signal,
                }),
              catch: (cause) =>
                isTrpcError(cause) ? cause : unexpectedError(cause),
            });
            return { inputs, ctx };
          }),
        );
        const outcome = (i: number): Effect.Effect<Outcome> =>
          Exit.isFailure(prepared)
            ? Effect.succeed({
                ok: false,
                error: normalizeCause(prepared.cause),
              })
            : run(
                request,
                calls[i]!,
                prepared.value.ctx,
                prepared.value.inputs[i],
                controller.signal,
                !isBatch,
              );

        if (!isBatch) {
          const call = calls[0]!;
          if (
            call.type === 'subscription' &&
            call.procedure &&
            Exit.isSuccess(prepared)
          ) {
            return yield* subscription(
              request,
              url,
              { ...call, procedure: call.procedure },
              prepared.value.ctx,
              prepared.value.inputs[0],
              controller,
            );
          }
          const result = yield* outcome(0);
          if (result.ok && result.response) {
            const options = responseOptions(result.headers);
            const { headers } = options;
            let out = HttpServerResponse.setHeaders(result.response, {
              ...headers,
              ...result.response.headers,
            });
            if (options.cookies)
              out = HttpServerResponse.mergeCookies(out, options.cookies);
            return out;
          }
          const body = yield* callBody(request, call, result);
          return json(body.status, body.text, result.headers);
        }

        const accept =
          request.headers['trpc-accept'] ??
          (request.headers['accept']
            ?.split(',')
            .some((t) => t.trim() === 'application/jsonl')
            ? 'application/jsonl'
            : undefined);
        if (accept === 'application/jsonl') {
          const data: Record<string, unknown> = {};
          calls.forEach((call, i) => {
            data[i] = Effect.map(outcome(i), (result) => {
              if (result.ok) {
                return {
                  result: Effect.succeed({ data: Effect.succeed(result.data) }),
                };
              }
              report(result.error, request, call.path);
              return {
                error: errorShape(
                  result.error,
                  call.path,
                  call.type,
                  call.procedure,
                ),
              };
            });
          });
          const lines = jsonlLines(data, {
            serialize: (value) => output.serialize(value),
            formatError: (cause, path) => {
              const call = calls[Number(path[0])];
              const err = normalizeCause(cause);
              report(err, request, call?.path);
              return errorShape(
                err,
                call?.path,
                call?.type ?? 'unknown',
                call?.procedure,
              );
            },
          });
          return HttpServerResponse.stream(
            Stream.encodeText(lines.pipe(abortOnInterrupt(controller))),
            { status: 200, contentType: 'application/json' },
          );
        }

        const results = yield* Effect.forEach(
          calls,
          (call, i) =>
            Effect.flatMap(outcome(i), (result) =>
              Effect.map(callBody(request, call, result), (body) => ({
                ...body,
                headers: result.headers,
              })),
            ),
          { concurrency: 'unbounded' },
        );
        const headers = new Headers();
        for (const result of results) {
          for (const [key, value] of result.headers ?? []) {
            if (key === 'set-cookie') headers.append(key, value);
            else headers.set(key, value);
          }
        }
        const statuses = new Set(results.map((r) => r.status));
        return json(
          statuses.size === 1 ? results[0]!.status : 207,
          `[${results.map((r) => r.text).join(',')}]`,
          headers,
        );
      }),
    );

  const app: Effect.Effect<
    HttpServerResponse.HttpServerResponse,
    never,
    HttpServerRequest.HttpServerRequest
  > = Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = new URL(request.url, 'http://localhost');
    const isBatch = url.searchParams.get('batch') === '1';
    const rest = url.pathname.startsWith(`${endpoint}/`)
      ? decodeURIComponent(url.pathname.slice(endpoint.length + 1))
      : undefined;
    const paths = isBatch ? (rest ?? '').split(',') : [rest ?? ''];
    const failAll = (err: AnyTrpcError) => {
      report(err, request);
      const text = JSON.stringify({
        error: output.serialize(errorShape(err, undefined, 'unknown')),
      });
      return json(
        statusOf(publicError(err)),
        isBatch ? `[${paths.map(() => text).join(',')}]` : text,
      );
    };
    return yield* Effect.gen(function* () {
      if (rest === undefined) {
        return yield* fail('NOT_FOUND', `Not found: ${url.pathname}`);
      }
      if (isBatch && !batch) {
        return yield* fail(
          'BAD_REQUEST',
          'Batching is not enabled on the server',
        );
      }
      if (isBatch && batch && paths.length > batch.maxItems) {
        return yield* fail('BAD_REQUEST', 'Batch call exceeds maximum size');
      }
      const procedures = yield* Effect.promise(() =>
        Promise.all(
          paths.map(async (path) => resolveProcedure(opts.router, path)),
        ),
      );
      const calls: Call[] = paths.map((path, i) => ({
        path,
        procedure: procedures[i],
        type: procedures[i]?.['~trpc'].type ?? 'unknown',
      }));
      const types = new Set(
        calls.flatMap((c) => (c.type === 'unknown' ? [] : [c.type])),
      );
      if (types.size > 1) {
        return yield* fail(
          'BAD_REQUEST',
          `Cannot mix procedure types in call: ${[...types].join(', ')}`,
        );
      }
      const type = [...types][0];
      const allowed =
        type === 'mutation'
          ? ['POST']
          : opts.allowMethodOverride
            ? ['GET', 'POST']
            : ['GET'];
      if (type !== undefined && !allowed.includes(request.method)) {
        return yield* fail(
          'METHOD_NOT_SUPPORTED',
          `Unsupported ${request.method}-request to ${type} procedure at path "${rest}"`,
        );
      }
      return yield* serve(request, url, calls, isBatch);
    }).pipe(
      Effect.catchCause((cause) =>
        Cause.hasInterruptsOnly(cause)
          ? Effect.failCause(cause)
          : Effect.succeed(failAll(normalizeCause(cause))),
      ),
    );
  }) as never;

  const middleware = opts.middleware ?? [];
  const served = middleware.reduceRight<
    Effect.Effect<HttpServerResponse.HttpServerResponse, any, any>
  >((inner, m) => m(inner), app);
  // HttpEffect runs apps uninterruptibly; an aborted `request.signal` must abort the call.
  const webHandler = HttpEffect.toWebHandler(
    Effect.interruptible(served) as never,
  );

  const handler: V11Handler<unknown> = {
    fetch: (request, platform) =>
      webHandler(
        request,
        platform === undefined
          ? undefined
          : (Context.make(CurrentPlatform, platform) as Context.Context<never>),
      ),
    websocket(socket, o) {
      serveV11Socket(core, socket, {
        request: HttpServerRequest.fromWeb(o.request),
        platform: o.platform,
        idleTimeoutMs: opts.websocket?.idleTimeoutMs ?? false,
      });
    },
    dispose: base.dispose,
  };
  httpApps.set(handler, { app, middleware });
  return handler as V11Handler<TPlatform>;
}
