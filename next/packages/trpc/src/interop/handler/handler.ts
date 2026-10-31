import {
  Cause,
  Context,
  Effect,
  Exit,
  Stream,
  type Duration,
  type Layer,
} from 'effect';
import { timerOption } from '../../internal/duration.ts';
import {
  interruptSignal,
  type InterruptSignal,
} from '../../internal/effects.ts';
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
  type BuiltinErrorCode,
  type CodeError,
} from '../../internal/error.ts';
import {
  hasMediaType,
  isJsonContentType,
  isMultipartContentType,
  sseIdField,
} from '../../internal/protocol.ts';
import type { MaybePromise, ProcedureType } from '../../internal/types.ts';
import { experimental_parseBracketNotation } from '../../openapi/rest/index.ts';
import {
  isAsyncIterable,
  isPromiseLike,
  isPlainObject,
} from '../../transformer/progressive-json/index.ts';
import {
  readBytes,
  responseOptions,
  createHandlerCore,
  type HandlerCore,
  CurrentPlatform,
  HttpApp,
  parentSpan,
  type ContextOption,
  type CreateContextOpts,
  type LayerOption,
  type RuntimeOption,
  type OnErrorOpts,
  type PlatformArgs,
  type PlatformField,
  setHandlerContext,
  strictestCacheControl,
} from '../../server/handler/index.ts';
import {
  createResponseHandle,
  normalizeCause,
  unexpectedError,
} from '../../server/execution/index.ts';
import {
  type AnyProcedure,
  resolveProcedure,
  type AnyRouter,
  type inferRouterContext,
  type inferRouterServices,
} from '../../server/procedures/index.ts';
import {
  runWebSocketLike,
  HandlerDrains,
  makeSocketDrains,
  type SocketDrains,
  type WebSocketLike,
  UpgradeServer,
} from '../../server/sockets/index.ts';
import { isTracked } from '../../server/subscriptions/index.ts';
import {
  BATCH_TOO_LARGE,
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
   * by default, of at most `maxItems` calls (v11's `maxBatchSize`, which
   * it left unlimited). `maxItems` also caps the calls in one `wsLink`
   * message, whose array of calls is answered as v11 answers an HTTP batch
   * over `maxBatchSize`; with `false`, sockets keep the default cap.
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
     * @default '15 seconds'
     */
    pingInterval?: Duration.Input | false;
  };
  websocket?: {
    /**
     * Close a WebSocket that sends nothing, `wsLink`'s keep-alive pings
     * included, for this long. `false` keeps silent sockets open.
     * @default false
     */
    idleTimeout?: Duration.Input | false;
  };
  /**
   * How long `dispose()` waits for the HTTP requests in flight before it
   * interrupts them.
   * @default '10 seconds'
   */
  drainTimeout?: Duration.Input;
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
  (
    | LayerOption<inferRouterServices<TRouter>>
    | RuntimeOption<inferRouterServices<TRouter>>
  );

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
  /**
   * Closes the open WebSockets (1012, "service restart"), so `wsLink`
   * reconnects elsewhere and resends its subscriptions, and ends their
   * sessions (a socket still connecting is closed once it opens). Ends the
   * requests `fetch` is serving: event streams at once, the rest after up
   * to `drainTimeout` (a 503 for one still running). Then releases the
   * `layer`'s resources; a `runtime` you passed is yours to dispose. The
   * handler takes no WebSockets after.
   */
  dispose(): Promise<void>;
  /** `dispose()`, for `await using`. */
  [Symbol.asyncDispose](): Promise<void>;
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
  /** The open WebSockets, which `dispose()` closes. */
  readonly drains: SocketDrains;
  /** The most calls one WebSocket message's array may carry: `batch.maxItems`. */
  readonly maxSocketBatch: number;
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

const decoder = /* @__PURE__ */ new TextDecoder();
const identity: V11Transformer = { serialize: (v) => v, deserialize: (v) => v };

const DEFAULT_MAX_BATCH = 100;

const fail = <C extends BuiltinErrorCode>(code: C, message: string) =>
  Effect.fail(new TrpcError({ code, message }) as CodeError<C>);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

/** v11 fails these for the whole request on `httpLink`, so without a path. */
const streamOutputErrors = new WeakSet<AnyTrpcError>();

const streamOutputError = () => {
  const err = new TrpcError.UnsupportedMediaType({
    message:
      'Cannot use stream-like response in non-streaming request - use httpBatchStreamLink',
  });
  streamOutputErrors.add(err);
  return err;
};

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

const acceptOf = (request: HttpServerRequest.HttpServerRequest) =>
  request.headers['trpc-accept'] ??
  (request.headers['accept']
    ?.split(',')
    .some((t) => t.trim() === 'application/jsonl')
    ? 'application/jsonl'
    : undefined);

const parseJson = (text: string) =>
  Effect.try({
    try: () => (text === '' ? undefined : (JSON.parse(text) as unknown)),
    catch: (cause) =>
      new TrpcError.BadRequest({
        message: (cause as SyntaxError).message,
        cause,
      }),
  });

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
  const drains = makeSocketDrains(0);
  const base = createHandlerCore({
    ...(opts as typeof opts & {
      createContext?: (o: CreateContextOpts<any>) => MaybePromise<object>;
      layer?: Layer.Layer<any, any, never>;
    }),
    drains,
  });
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
  const ssePing = timerOption(opts.sse?.pingInterval, '15 seconds');
  const batch =
    opts.batch === false
      ? undefined
      : {
          maxItems:
            (typeof opts.batch === 'object'
              ? opts.batch.maxItems
              : undefined) ?? DEFAULT_MAX_BATCH,
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
    drains,
    maxSocketBatch: batch?.maxItems ?? DEFAULT_MAX_BATCH,
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
    single: boolean,
  ): Effect.Effect<{ status: number; text: string }> => {
    const failed = (err: AnyTrpcError) => {
      const path =
        single && streamOutputErrors.has(err) ? undefined : call.path;
      report(
        err,
        request,
        path,
        call.type === 'unknown' ? undefined : call.type,
      );
      return {
        status: statusOf(publicError(err), call.procedure?.['~trpc'].errors),
        text: JSON.stringify({
          error: output.serialize(
            errorShape(err, path, call.type, call.procedure),
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
      const octet =
        type !== null && hasMediaType(type, 'application/octet-stream');
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
            new TrpcError.ParseError({
              tag: 'InvalidBody',
              message: 'Invalid multipart body',
              cause,
            }),
        });
        return {
          value: experimental_parseBracketNotation(
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
            new TrpcError.BadRequest({
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

  /** Checked per call, as v11 does, so each error has its call's path. */
  const methodError = (
    request: HttpServerRequest.HttpServerRequest,
    call: Call,
  ): AnyTrpcError | undefined => {
    const allowed =
      call.type === 'mutation'
        ? ['POST']
        : opts.allowMethodOverride
          ? ['GET', 'POST']
          : ['GET'];
    return allowed.includes(request.method)
      ? undefined
      : new TrpcError({
          code: 'METHOD_NOT_SUPPORTED',
          tag: 'ProcedureTypeMismatch',
          message: `Unsupported ${request.method}-request to ${call.type} procedure at path "${call.path}"`,
        });
  };

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
          error: new TrpcError.NotFound({
            tag: 'ProcedureNotFound',
            message: `No procedure found on path "${call.path}"`,
          }),
        } as const;
      }
      const wrongMethod = methodError(request, call);
      if (wrongMethod) return { ok: false, error: wrongMethod } as const;
      if (call.type === 'subscription') {
        return {
          ok: false,
          error: new TrpcError.BadRequest({
            tag: 'InvalidBatch',
            message: 'Cannot batch subscription calls',
          }),
        } as const;
      }
      const procedure = call.procedure;
      const response = createResponseHandle();
      const parent = yield* parentSpan(request);
      const exit = yield* base.run({
        request,
        procedure,
        path: call.path,
        ctx,
        input: callInput,
        signal,
        response,
        allowResponse: single,
        parent,
      });
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
    prepared: Exit.Exit<{ ctx: object; input: unknown }, AnyTrpcError>,
    interrupt: InterruptSignal,
  ) =>
    Effect.gen(function* () {
      const response = createResponseHandle();
      const wrongMethod = methodError(request, call);
      const exit: Exit.Exit<unknown, unknown> = wrongMethod
        ? Exit.fail(wrongMethod)
        : Exit.isFailure(prepared)
          ? prepared
          : yield* base.run({
              request,
              procedure: call.procedure,
              path: call.path,
              ctx: prepared.value.ctx,
              input: prepared.value.input,
              signal: interrupt.signal,
              response,
              lastEventId:
                request.headers['last-event-id'] ??
                url.searchParams.get('lastEventId') ??
                url.searchParams.get('Last-Event-Id') ??
                inputEventId(prepared.value.input),
              parent: yield* parentSpan(request),
            });
      // Each event ends with two blank lines, as v11's do.
      const frame = (event: string | undefined, data: string, idField = '') =>
        `${event === undefined ? '' : `event: ${event}\n`}data: ${data}\n${idField}\n\n`;
      // EventSource gives an event without an `id` the last id it received,
      // which v11 clients read as tracked. So, as v11 does since trpc/trpc#7691,
      // an untracked event after one clears the id, and a `restore-id` event
      // no client listens to sets it back for the next reconnect. The id
      // starts as the one EventSource reconnected with.
      const resumedId =
        request.headers['last-event-id'] ??
        url.searchParams.get('lastEventId') ??
        url.searchParams.get('Last-Event-Id');
      let lastEventId =
        resumedId && !/[\0\n\r]/.test(resumedId) ? resumedId : null;
      const eventFrame = (event: unknown) => {
        if (!isTracked(event)) {
          const data = JSON.stringify(output.serialize(event));
          return lastEventId === null
            ? frame(undefined, data)
            : frame(undefined, data, 'id: \n') +
                frame('restore-id', '', sseIdField(lastEventId));
        }
        const idField = sseIdField(event.id);
        if (idField !== '') lastEventId = event.id;
        return frame(
          undefined,
          JSON.stringify(output.serialize(event.data)),
          idField,
        );
      };
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
            Stream.map(eventFrame),
            Stream.concat(Stream.make(frame('return', ''))),
            Stream.catchCause((cause) =>
              Cause.hasInterruptsOnly(cause)
                ? Stream.failCause(cause)
                : Stream.make(errorFrame(normalizeCause(cause))),
            ),
          );
      // Abort inside the merge: interrupting the merge waits for this side's
      // finalizers, which wait for a resolver that awaits its signal.
      const frames = Stream.concat(
        Stream.make(frame('connected', '{}')),
        events,
      ).pipe((self) => interrupt.abortOnInterrupt(self));
      const body =
        ssePing === undefined
          ? frames
          : Stream.merge(
              frames,
              Stream.tick(ssePing).pipe(
                Stream.drop(1),
                Stream.map(() => frame('ping', '')),
              ),
              { haltStrategy: 'left' },
            );
      const options = responseOptions(response.headers);
      const { headers } = options;
      return HttpServerResponse.stream(Stream.encodeText(body), {
        status: 200,
        contentType: 'text/event-stream',
        headers: {
          ...headers,
          'cache-control': 'no-cache, no-transform',
          'x-accel-buffering': 'no',
        },
        ...(options.cookies ? { cookies: options.cookies } : {}),
      });
    });

  const serve = (
    request: HttpServerRequest.HttpServerRequest,
    url: URL,
    calls: ReadonlyArray<Call>,
    isBatch: boolean,
  ): Effect.Effect<HttpServerResponse.HttpServerResponse, AnyTrpcError> =>
    Effect.flatMap(interruptSignal(), (interrupt) =>
      Effect.gen(function* () {
        const prepared = yield* Effect.exit(
          Effect.gen(function* () {
            const inputs = yield* readInputs(
              request,
              url,
              isBatch,
              calls.length,
            );
            const platform = yield* CurrentPlatform;
            const ctx = yield* base.makeContext({
              request,
              platform,
              calls: calls.flatMap((c) =>
                c.type === 'unknown' ? [] : [{ path: c.path, type: c.type }],
              ),
              signal: interrupt.signal,
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
                interrupt.signal,
                !isBatch,
              );

        if (!isBatch) {
          const call = calls[0]!;
          if (call.type === 'subscription' && call.procedure) {
            return yield* subscription(
              request,
              url,
              { ...call, procedure: call.procedure },
              Exit.isFailure(prepared)
                ? Exit.fail(normalizeCause(prepared.cause))
                : Exit.succeed({
                    ctx: prepared.value.ctx,
                    input: prepared.value.inputs[0],
                  }),
              interrupt,
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
          const body = yield* callBody(request, call, result, true);
          return json(body.status, body.text, result.headers);
        }

        if (acceptOf(request) === 'application/jsonl') {
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
            Stream.encodeText(interrupt.abortOnInterrupt(lines)),
            { status: 200, contentType: 'application/json' },
          );
        }

        const results = yield* Effect.forEach(
          calls,
          (call, i) =>
            Effect.flatMap(outcome(i), (result) =>
              Effect.map(callBody(request, call, result, false), (body) => ({
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
            else if (key !== 'cache-control') headers.set(key, value);
          }
        }
        const cacheControl = strictestCacheControl(
          results.map((result) => result.headers?.get('cache-control')),
        );
        if (cacheControl) headers.set('cache-control', cacheControl);
        const statuses = new Set(results.map((r) => r.status));
        return json(
          statuses.size === 1 ? results[0]!.status : 207,
          `[${results.map((r) => r.text).join(',')}]`,
          headers,
        );
      }).pipe((self) => interrupt.abortOnInterrupt(self)),
    );

  const app: Effect.Effect<
    HttpServerResponse.HttpServerResponse,
    never,
    HttpServerRequest.HttpServerRequest
  > = Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    // v11 answers HEAD with an empty 204, for health checks and Lambda warm-ups.
    if (request.method === 'HEAD') {
      return HttpServerResponse.empty({ status: 204 });
    }
    const url = new URL(request.url, 'http://localhost');
    const isBatch = url.searchParams.get('batch') === '1';
    const encoded = url.pathname.startsWith(`${endpoint}/`)
      ? url.pathname.slice(endpoint.length + 1)
      : undefined;
    // A request-level error is one object even for a batch, as v11 sends it.
    const failAll = (err: AnyTrpcError) => {
      report(err, request);
      return json(
        statusOf(publicError(err)),
        JSON.stringify({
          error: output.serialize(errorShape(err, undefined, 'unknown')),
        }),
      );
    };
    return yield* Effect.gen(function* () {
      if (encoded === undefined) {
        return yield* fail('NOT_FOUND', `Not found: ${url.pathname}`);
      }
      const rest = yield* Effect.try({
        try: () => decodeURIComponent(encoded),
        catch: (cause) =>
          new TrpcError.BadRequest({
            message: `Malformed path: ${url.pathname}`,
            cause,
          }),
      });
      const paths = isBatch ? rest.split(',') : [rest];
      const type = request.headers['content-type'];
      if (
        request.method !== 'GET' &&
        type !== undefined &&
        !isMultipartContentType(type) &&
        !hasMediaType(type, 'application/octet-stream') &&
        !isJsonContentType(type)
      ) {
        return yield* fail(
          'UNSUPPORTED_MEDIA_TYPE',
          `Unsupported content-type "${type}"`,
        );
      }
      if (isBatch && !batch) {
        return yield* fail(
          'BAD_REQUEST',
          'Batching is not enabled on the server',
        );
      }
      if (!isBatch && acceptOf(request) === 'application/jsonl') {
        return yield* fail(
          'BAD_REQUEST',
          'Streaming requests must be batched (you can do a batch of 1)',
        );
      }
      if (isBatch && batch && paths.length > batch.maxItems) {
        return yield* fail('BAD_REQUEST', BATCH_TOO_LARGE);
      }
      const procedures = yield* Effect.forEach(
        paths,
        (path) => resolveProcedure(opts.router, path),
        { concurrency: 'unbounded' },
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
      return yield* serve(request, url, calls, isBatch);
    }).pipe(
      Effect.catchCause((cause) =>
        Cause.hasInterruptsOnly(cause)
          ? Effect.failCause(cause)
          : Effect.succeed(failAll(normalizeCause(cause))),
      ),
      Effect.map((response) =>
        HttpServerResponse.setHeader(
          response,
          'vary',
          response.headers['vary']
            ? `${response.headers['vary']}, trpc-accept, accept`
            : 'trpc-accept, accept',
        ),
      ),
    );
  }) as never;

  const middleware = opts.middleware ?? [];
  const idleTimeout = timerOption(opts.websocket?.idleTimeout, false);
  const served = middleware.reduceRight<
    Effect.Effect<HttpServerResponse.HttpServerResponse, any, any>
  >((inner, m) => m(inner), app);
  // HttpEffect runs apps uninterruptibly; an aborted `request.signal` must abort the call.
  const webHandler = HttpEffect.toWebHandler(
    base.request(Effect.interruptible(served)) as never,
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
      base.fork(
        runWebSocketLike(socket, (effectSocket) =>
          serveV11Socket(core, effectSocket, {
            request: HttpServerRequest.fromWeb(o.request),
            platform: o.platform,
            idleTimeout,
          }),
        ),
      );
    },
    dispose: base.dispose,
    [Symbol.asyncDispose]: base.dispose,
  };
  setHandlerContext(
    handler,
    Context.make(HttpApp, { app, middleware }).pipe(
      Context.add(HandlerDrains, core.drains),
      Context.add(UpgradeServer, (socket, request) =>
        serveV11Socket(core, socket, {
          request,
          platform: undefined,
          idleTimeout,
        }),
      ),
    ),
  );
  return handler as V11Handler<TPlatform>;
}
