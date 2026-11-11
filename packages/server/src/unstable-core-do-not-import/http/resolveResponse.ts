/* oxlint-disable typescript/no-non-null-assertion */
import {
  isObservable,
  observableToAsyncIterable,
} from '../../observable/observable';
import { getErrorShape, getFallbackErrorShape } from '../error/getErrorShape';
import { getTRPCErrorFromUnknown, TRPCError } from '../error/TRPCError';
import type { AnyProcedure, ProcedureType } from '../procedure';
import type { AnyRouter } from '../router';
import type { TRPCResponse } from '../rpc';
import { isPromise, jsonlStreamProducer } from '../stream/jsonl';
import { sseHeaders, sseStreamProducer } from '../stream/sse';
import { transformTRPCResponse } from '../transformer';
import { abortSignalsAnyPonyfill, isAsyncIterable, isObject } from '../utils';
import { getAcceptHeader, getLastEventId, getRequestInfo } from './contentType';
import { getHTTPStatusCode } from './getHTTPStatusCode';
import type { Outcome } from './outcome';
import { attempt, fail, ok, settle } from './outcome';
import { urlPathToProcedurePath } from './pathSeparator';
import type { ErrorSource, RequestEvent, RequestState } from './requestMachine';
import { requestMachine } from './requestMachine';
import type { BodyListener, RequestLifetime } from './responseBody';
import { requestLifetime, streamBody, subscriptionBody } from './responseBody';
import type {
  HTTPBaseHandlerOptions,
  ResolveHTTPRequestOptionsContextFn,
  TRPCRequestInfo,
  TRPCRequestInfoProcedureCall,
} from './types';

interface ResolveHTTPRequestOptions<
  TRouter extends AnyRouter,
> extends HTTPBaseHandlerOptions<TRouter, Request> {
  createContext: ResolveHTTPRequestOptionsContextFn<TRouter>;
  req: Request;
  path: string;
  /**
   * If the request had an issue before reaching the handler
   */
  error: TRPCError | null;
  /**
   * Headers set outside `responseMeta`, such as the fetch adapter's
   * `resHeaders`. If the response fails after `responseMeta` ran, the error
   * response drops the headers `responseMeta` returned but keeps these. Every
   * other response gets them from `responseMeta`.
   */
  resHeaders?: Headers;
}

// ---------- the request

/** The request, and where it is on its way to a response */
interface RequestScope {
  // `any`, so every router's options fit: `TRouter` only matters to callers
  opts: ResolveHTTPRequestOptions<any>;
  config: AnyRouter['_def']['_config'];
  url: URL;
  state: RequestState;
  /** Set once the request is parsed */
  info: TRPCRequestInfo | null;
  /** The context, or why it couldn't be created; set once that was tried */
  ctx: Outcome<unknown> | null;
  /** The methods a rejected call accepts, for the `allow` header */
  allow: string | null;
}

/** A request that was parsed and accepted, with its context created */
interface AcceptedRequest extends RequestScope {
  info: TRPCRequestInfo;
  ctx: Outcome<unknown>;
  lifetime: RequestLifetime;
}

/** A call that returned */
interface CallOk {
  data: unknown;
  /** The signal the procedure got */
  signal: AbortSignal;
  /** Aborts the procedure's signal, to end a subscription */
  abort: () => void;
}

type PendingCalls = Promise<Outcome<CallOk>>[];

function sourceOf(call: TRPCRequestInfoProcedureCall): ErrorSource {
  return { type: call.procedure?._def.type ?? 'unknown', call };
}

function ctxOf(scope: RequestScope) {
  return scope.ctx?.ok ? scope.ctx.value : undefined;
}

function reportError(
  scope: RequestScope,
  error: TRPCError,
  source: ErrorSource,
) {
  scope.opts.onError?.({
    error,
    path: source.call?.path,
    input: source.call?.result(),
    ctx: ctxOf(scope),
    type: source.type,
    req: scope.opts.req,
  });
}

/**
 * Moves the request along, runs the effects that only report, and returns
 * the ones that answer, for the caller to run.
 */
function send(scope: RequestScope, event: RequestEvent) {
  const { state, effects } = requestMachine.transition(scope.state, event);
  scope.state = state;
  for (const effect of effects) {
    if (effect.type === 'reportError') {
      reportError(scope, effect.error, effect.source);
    }
  }
  return effects.filter((effect) => effect.type !== 'reportError');
}

/**
 * The error's shape for the client. A throwing `errorFormatter` is reported
 * and leaves the error a shape that says nothing beyond its code, which the
 * HTTP status reveals anyway, so an error can always be sent.
 */
function errorShape(
  scope: RequestScope,
  error: TRPCError,
  source: ErrorSource,
) {
  try {
    return getErrorShape({
      config: scope.config,
      ctx: ctxOf(scope),
      error,
      input: source.call?.result(),
      path: source.call?.path,
      type: source.type,
    });
  } catch (cause) {
    reportError(scope, getTRPCErrorFromUnknown(cause), source);
    return getFallbackErrorShape(error);
  }
}

/**
 * `decodeURIComponent` throws a plain `URIError` on malformed escape sequences,
 * which would otherwise surface as an `INTERNAL_SERVER_ERROR` even though the
 * request itself is at fault
 */
function decodePath(path: string): Outcome<string> {
  try {
    return ok(decodeURIComponent(path));
  } catch (cause) {
    return fail(
      new TRPCError({
        code: 'BAD_REQUEST',
        message: `Invalid URL-encoding in path "${path}"`,
        cause,
      }),
    );
  }
}

async function parseRequest(
  scope: RequestScope,
): Promise<Outcome<TRPCRequestInfo>> {
  const { opts, config, url } = scope;
  const path = decodePath(opts.path);
  if (!path.ok) {
    return path;
  }
  return getRequestInfo({
    req: opts.req,
    path: urlPathToProcedurePath(path.value, config.pathSeparator),
    router: opts.router,
    searchParams: url.searchParams,
    headers: opts.req.headers,
    url,
    maxBatchSize: opts.maxBatchSize,
  });
}

/** Why the request is rejected before its context is created, if it is */
function rejectRequest(
  scope: RequestScope,
  info: TRPCRequestInfo,
): TRPCError | null {
  const { opts } = scope;
  const allowBatching = opts.allowBatching ?? opts.batching?.enabled ?? true;
  if (info.isBatchCall && !allowBatching) {
    return new TRPCError({
      code: 'BAD_REQUEST',
      message: `Batching is not enabled on the server`,
    });
  }
  /**
   * @deprecated
   */
  const isStreamCall =
    getAcceptHeader(opts.req.headers) === 'application/jsonl';
  if (isStreamCall && !info.isBatchCall) {
    return new TRPCError({
      message: `Streaming requests must be batched (you can do a batch of 1)`,
      code: 'BAD_REQUEST',
    });
  }
  return null;
}

// ---------- the procedure calls

function acceptedMethods(
  type: ProcedureType,
  allowMethodOverride: boolean | undefined,
): string[] {
  // never allow GET to do a mutation
  if (type === 'mutation') {
    return ['POST'];
  }
  return allowMethodOverride ? ['GET', 'POST'] : ['GET'];
}

/** The procedure to call, unless the call is rejected */
function procedureFor(
  request: AcceptedRequest,
  call: TRPCRequestInfoProcedureCall,
): Outcome<AnyProcedure> {
  const { opts, info } = request;
  if (opts.error) {
    return fail(opts.error);
  }
  const proc = call.procedure;
  if (!proc) {
    return fail(
      new TRPCError({
        code: 'NOT_FOUND',
        message: `No procedure found on path "${call.path}"`,
      }),
    );
  }
  const type = proc._def.type;
  const accepted = acceptedMethods(type, opts.allowMethodOverride);
  if (!accepted.includes(opts.req.method)) {
    // a 405 must list the methods the procedure accepts (RFC 9110 15.5.6)
    request.allow = accepted.join(', ');
    return fail(
      new TRPCError({
        code: 'METHOD_NOT_SUPPORTED',
        message: `Unsupported ${opts.req.method}-request to ${type} procedure at path "${call.path}"`,
      }),
    );
  }
  if (type === 'subscription' && info.isBatchCall) {
    return fail(
      new TRPCError({
        code: 'BAD_REQUEST',
        message: `Cannot batch subscription calls`,
      }),
    );
  }
  return ok(proc);
}

/**
 * Calls a procedure, reporting the error if it fails. The procedure is
 * called synchronously, so a batch's procedures start in order.
 */
async function resolveCall(
  request: AcceptedRequest,
  call: TRPCRequestInfoProcedureCall,
): Promise<Outcome<CallOk>> {
  const { ctx, lifetime } = request;
  const result = await settle(async () => {
    const proc = procedureFor(request, call);
    if (!proc.ok) {
      return proc;
    }
    if (!ctx.ok) {
      return ctx;
    }
    const controller = new AbortController();
    const signal = abortSignalsAnyPonyfill([
      lifetime.signal,
      controller.signal,
    ]);
    const data: unknown = await proc.value({
      path: call.path,
      getRawInput: call.getRawInput,
      ctx: ctx.value,
      type: proc.value._def.type,
      signal,
      batchIndex: call.batchIndex,
    });
    return ok<CallOk>({ data, signal, abort: () => controller.abort() });
  });
  if (!result.ok) {
    reportError(request, result.error, sourceOf(call));
  }
  return result;
}

// ---------- the response

/** The headers every response gets: `vary`, and `allow` once a call sets it */
function requestHeaders(scope: RequestScope): Headers {
  const headers = new Headers([['vary', 'trpc-accept, accept']]);
  if (scope.allow !== null) {
    headers.set('allow', scope.allow);
  }
  return headers;
}

/** The results a response is built from; `null` for streamed responses */
type ResponseResults = {
  data: TRPCResponse[];
  /** aligned with `data` by index; `undefined` for successful responses */
  errors: (TRPCError | undefined)[];
} | null;

/**
 * Runs `responseMeta` and adds its headers, returning the status. Only the
 * request decides when it runs, so it runs at most once.
 */
function callResponseMeta(
  scope: RequestScope,
  headers: Headers,
  results: ResponseResults,
): number {
  const { opts, info } = scope;
  const meta =
    opts.responseMeta?.({
      ctx: ctxOf(scope),
      info: info ?? undefined,
      paths: info?.calls.map((call) => call.path),
      data: results?.data ?? [],
      errors: results?.errors.filter((error) => error !== undefined) ?? [],
      eagerGeneration: !results,
      type:
        info?.calls.find((call) => call.procedure)?.procedure!._def.type ??
        'unknown',
    }) ?? {};

  if (meta.headers instanceof Headers) {
    for (const [key, value] of meta.headers.entries()) {
      headers.append(key, value);
    }
  } else if (meta.headers) {
    /**
     * @deprecated, delete in v12
     */
    for (const [key, value] of Object.entries(meta.headers)) {
      if (Array.isArray(value)) {
        for (const v of value) {
          headers.append(key, v);
        }
      } else if (typeof value === 'string') {
        headers.set(key, value);
      }
    }
  }

  if (meta.status) {
    return meta.status;
  }
  return results ? getHTTPStatusCode(results.data, results.errors) : 200;
}

/**
 * Asks the request to describe the response being built, and runs
 * `responseMeta` for it, returning the status. Streamed responses start
 * before their results are known, so their `results` is `null`.
 */
function applyResponseMeta(
  scope: RequestScope,
  headers: Headers,
  results: ResponseResults,
): number {
  const effects = send(scope, { type: 'describe' });
  if (effects.some((effect) => effect.type === 'callResponseMeta')) {
    return callResponseMeta(scope, headers, results);
  }
  return results ? getHTTPStatusCode(results.data, results.errors) : 200;
}

/** Starts the headers of the response being built, on top of the request's */
function startHeaders(
  scope: RequestScope,
  init: Record<string, string>,
): Headers {
  const headers = requestHeaders(scope);
  for (const [key, value] of Object.entries(init)) {
    headers.set(key, value);
  }
  send(scope, { type: 'headersStarted', headers });
  return headers;
}

/** Returns `response`, telling the request whether its body still runs */
function responded(
  scope: RequestScope,
  response: Response,
  streamed: boolean,
): Outcome<Response> {
  send(scope, { type: 'responded', streamed });
  return ok(response);
}

/** Tells the request how a streamed body ended; a failure is the call's */
function bodyListener(scope: RequestScope, source: ErrorSource): BodyListener {
  return {
    ended: () => send(scope, { type: 'bodyEnded' }),
    failed: (error) => send(scope, { type: 'failed', error, source }),
  };
}

/**
 * Check if a value is a stream-like object
 * - if it's an async iterable
 * - if it's an object with async iterables or promises
 */
function isDataStream(v: unknown) {
  if (!isObject(v)) {
    return false;
  }

  if (isAsyncIterable(v)) {
    return true;
  }

  return (
    Object.values(v).some(isPromise) || Object.values(v).some(isAsyncIterable)
  );
}

function streamInJSONResponseError() {
  return new TRPCError({
    code: 'UNSUPPORTED_MEDIA_TYPE',
    message:
      'Cannot use stream-like response in non-streaming request - use httpBatchStreamLink',
  });
}

/**
 * `httpLink` and `httpBatchLink`: waits for every call, blocking on the
 * slowest one, then responds with all the results.
 */
async function jsonResponse(
  request: AcceptedRequest,
  calls: PendingCalls,
): Promise<Outcome<Response>> {
  const { info } = request;
  const results = await Promise.all(calls);
  const headers = startHeaders(request, { 'content-type': 'application/json' });

  const outcomes = results.map((result, index) => {
    if (!result.ok || !isDataStream(result.value.data)) {
      return result;
    }
    const error = streamInJSONResponseError();
    reportError(request, error, sourceOf(info.calls[index]!));
    return fail(error);
  });
  const data = outcomes.map((outcome, index): TRPCResponse => {
    if (outcome.ok) {
      return { result: { data: outcome.value.data } };
    }
    const source = sourceOf(info.calls[index]!);
    return { error: errorShape(request, outcome.error, source) };
  });

  // serialized first, so `responseMeta` only sees a response that can be sent
  const body = JSON.stringify(
    transformTRPCResponse(request.config, info.isBatchCall ? data : data[0]!),
  );
  const status = applyResponseMeta(request, headers, {
    data,
    errors: outcomes.map((outcome) => (outcome.ok ? undefined : outcome.error)),
  });
  return responded(request, new Response(body, { status, headers }), false);
}

/**
 * `httpBatchStreamLink`: responds straight away, then streams each result
 * as it settles.
 */
function jsonlResponse(
  request: AcceptedRequest,
  calls: PendingCalls,
): Outcome<Response> {
  const { config, info, lifetime } = request;
  const headers = startHeaders(request, {
    'content-type': config.jsonl?.contentType ?? 'application/json',
    'transfer-encoding': 'chunked',
  });
  const status = applyResponseMeta(request, headers, null);

  const stream = jsonlStreamProducer({
    ...config.jsonl,
    /**
     * Example structure for `maxDepth: 4`:
     * {
     *   // 1
     *   0: {
     *     // 2
     *     result: {
     *       // 3
     *       data: // 4
     *     }
     *   }
     * }
     */
    maxDepth: Infinity,
    data: calls.map(async (pending, index) => {
      const result = await pending;
      if (!result.ok) {
        const source = sourceOf(info.calls[index]!);
        return { error: errorShape(request, result.error, source) };
      }

      /**
       * Not very pretty, but we need to wrap nested data in promises
       * Our stream producer will only resolve top-level async values or async values that are directly nested in another async value
       */
      const { data } = result.value;
      return {
        result: Promise.resolve({
          data: isObservable(data)
            ? observableToAsyncIterable(data, lifetime.signal)
            : Promise.resolve(data),
        }),
      };
    }),
    serialize: (data) => config.transformer.output.serialize(data),
    onError: (cause) => {
      const source = sourceOf(info.calls[cause.path[0] as number]!);
      reportError(request, getTRPCErrorFromUnknown(cause.error), source);
    },
    formatError(errorOpts) {
      // no need to call `onError` here as it will be propagated through the stream itself
      const source = sourceOf(info.calls[errorOpts.path[0] as number]!);
      const error = getTRPCErrorFromUnknown(errorOpts.error);
      return errorShape(request, error, source);
    },
  });

  const body = streamBody(stream, {
    lifetime,
    listener: bodyListener(request, { type: info.type, call: null }),
  });
  return responded(request, new Response(body, { headers, status }), true);
}

async function* throwing(error: TRPCError): AsyncGenerator<never> {
  throw error;
}

/** What a subscription streams: its values, or the error it ends with */
function subscriptionIterable(
  request: AcceptedRequest,
  result: Outcome<CallOk>,
): AsyncIterable<unknown> {
  if (!result.ok) {
    return throwing(result.error);
  }
  if (!(request.config.sse?.enabled ?? true)) {
    return throwing(
      new TRPCError({
        code: 'METHOD_NOT_SUPPORTED',
        message: 'Missing experimental flag "sseSubscriptions"',
      }),
    );
  }
  const { data } = result.value;
  if (isObservable(data)) {
    return observableToAsyncIterable(data, request.lifetime.signal);
  }
  if (isAsyncIterable(data)) {
    return data;
  }
  return throwing(
    new TRPCError({
      message: `Subscription ${
        request.info.calls[0]!.path
      } did not return an observable or a AsyncGenerator`,
      code: 'INTERNAL_SERVER_ERROR',
    }),
  );
}

/**
 * `httpSubscriptionLink`: streams the subscription's values as server-sent
 * events.
 */
async function sseResponse(
  request: AcceptedRequest,
  calls: PendingCalls,
): Promise<Outcome<Response>> {
  const { config, opts, url, info, lifetime } = request;
  const source = sourceOf(info.calls[0]!);
  const result = await calls[0]!;

  const stream = sseStreamProducer({
    ...config.sse,
    lastEventId: getLastEventId({
      headers: opts.req.headers,
      searchParams: url.searchParams,
    }),
    data: subscriptionIterable(request, result),
    serialize: (v) => config.transformer.output.serialize(v),
    formatError(errorOpts) {
      const error = getTRPCErrorFromUnknown(errorOpts.error);
      // a call that failed streams only its own error, reported when it failed
      if (result.ok) {
        reportError(request, error, source);
      }
      return errorShape(request, error, source);
    },
  });
  const headers = startHeaders(request, sseHeaders);
  const status = applyResponseMeta(request, headers, null);

  const listener = bodyListener(request, source);
  const body = result.ok
    ? subscriptionBody(stream, {
        lifetime,
        listener,
        call: result.value,
        maxDurationMs: config.sse?.maxDurationMs,
      })
    : streamBody(stream, { lifetime, listener });
  return responded(request, new Response(body, { headers, status }), true);
}

/**
 * The response for an error that fails the whole request, such as a
 * malformed request or a `responseMeta`, `errorFormatter` or transformer that
 * throws. It replaces the response being built, and is never sent once one
 * was: the request decides which headers and whether `responseMeta` runs.
 */
function errorResponse(scope: RequestScope, error: TRPCError): Response {
  const source: ErrorSource = {
    type: scope.info?.type ?? 'unknown',
    call: null,
  };
  // a response can only fail before it's returned, so the error replaces it
  const effects = send(scope, { type: 'failed', error, source });
  const answer = effects.find((effect) => effect.type === 'respondWithError');

  const data: TRPCResponse = { error: errorShape(scope, error, source) };
  const body = JSON.stringify(transformTRPCResponse(scope.config, data));
  const results = { data: [data], errors: [error] };
  if (answer?.callResponseMeta) {
    const headers = answer.headers ?? requestHeaders(scope);
    const status = callResponseMeta(scope, headers, results);
    return new Response(body, { status, headers });
  }

  // `responseMeta` ran for a response that failed: drop its headers, and the
  // response's, as they describe that response, not this one
  const headers = requestHeaders(scope);
  for (const [key, value] of scope.opts.resHeaders ?? []) {
    headers.append(key, value);
  }
  headers.set('content-type', 'application/json');
  const status = getHTTPStatusCode(results.data, results.errors);
  return new Response(body, { status, headers });
}

/**
 * Parses the request, resolves its procedure calls, then builds the response
 * for the link that sent it.
 */
async function respond(scope: RequestScope): Promise<Outcome<Response>> {
  const parsed = await parseRequest(scope);
  if (!parsed.ok) {
    return parsed;
  }
  const info = (scope.info = parsed.value);

  const rejection = rejectRequest(scope, info);
  if (rejection) {
    return fail(rejection);
  }

  const ctx = (scope.ctx = await attempt(() =>
    scope.opts.createContext({ info }),
  ));
  // the same object, so the fallback sees where the response got to
  const request: AcceptedRequest = Object.assign(scope, {
    info,
    ctx,
    lifetime: requestLifetime(scope.opts.req),
  });
  const calls = info.calls.map((call) => resolveCall(request, call));

  if (!info.isBatchCall && info.type === 'subscription') {
    return sseResponse(request, calls);
  }
  if (info.isBatchCall && info.accept === 'application/jsonl') {
    return jsonlResponse(request, calls);
  }
  return jsonResponse(request, calls);
}

/**
 * Handles a Fetch API `Request` for a router and returns its `Response`.
 * Every adapter uses it; call it to write your own.
 */
export async function resolveResponse<TRouter extends AnyRouter>(
  opts: ResolveHTTPRequestOptions<TRouter>,
): Promise<Response> {
  const url = new URL(opts.req.url);

  if (opts.req.method === 'HEAD') {
    // can be used for lambda warmup
    return new Response(null, {
      status: 204,
    });
  }

  const scope: RequestScope = {
    opts,
    config: opts.router._def._config,
    url,
    state: requestMachine.initial.state,
    info: null,
    ctx: null,
    allow: null,
  };
  const response = await settle(() => respond(scope));
  return response.ok ? response.value : errorResponse(scope, response.error);
}
