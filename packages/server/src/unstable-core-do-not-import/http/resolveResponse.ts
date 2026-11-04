/* oxlint-disable typescript/no-non-null-assertion */
import {
  isObservable,
  observableToAsyncIterable,
} from '../../observable/observable';
import { getErrorShape } from '../error/getErrorShape';
import { getTRPCErrorFromUnknown, TRPCError } from '../error/TRPCError';
import type { AnyProcedure, ProcedureType } from '../procedure';
import type { AnyRouter } from '../router';
import type { TRPCResponse } from '../rpc';
import { isPromise, jsonlStreamProducer } from '../stream/jsonl';
import { sseHeaders, sseStreamProducer } from '../stream/sse';
import { transformTRPCResponse } from '../transformer';
import type { MaybePromise, Result } from '../types';
import { abortSignalsAnyPonyfill, isAsyncIterable, isObject } from '../utils';
import { getAcceptHeader, getLastEventId, getRequestInfo } from './contentType';
import { getHTTPStatusCode } from './getHTTPStatusCode';
import { urlPathToProcedurePath } from './pathSeparator';
import type { RequestLifetime } from './responseBody';
import {
  batchStreamBody,
  requestLifetime,
  subscriptionBody,
} from './responseBody';
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
}

// ---------- errors as values

/** What a step produced, or the error it failed with */
type Outcome<TValue> = Result<TValue, TRPCError>;

function ok<TValue>(value: TValue): Outcome<TValue> {
  return { ok: true, value };
}

function fail(error: TRPCError): Outcome<never> {
  return { ok: false, error };
}

/** Runs `fn`, turning anything it throws into a failed outcome */
async function settle<TValue>(
  fn: () => MaybePromise<Outcome<TValue>>,
): Promise<Outcome<TValue>> {
  try {
    return await fn();
  } catch (cause) {
    return fail(getTRPCErrorFromUnknown(cause));
  }
}

/** Runs `fn` straight away, wrapping what it returns or throws */
function attempt<TValue>(
  fn: () => MaybePromise<TValue>,
): Promise<Outcome<TValue>> {
  return settle(async () => ok(await fn()));
}

// ---------- the request

/** What's known about the request so far, shared by every step */
interface RequestScope {
  // `any`, so every router's options fit: `TRouter` only matters to callers
  opts: ResolveHTTPRequestOptions<any>;
  config: AnyRouter['_def']['_config'];
  url: URL;
  /** The headers of the response, whichever response it ends up being */
  headers: Headers;
  /** Set once the request is parsed */
  info?: TRPCRequestInfo;
  /** Set once the request is accepted */
  ctx?: Outcome<unknown>;
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

/** Where an error happened, for `onError` and the error formatter */
interface ErrorSource {
  type: ProcedureType | 'unknown';
  call?: TRPCRequestInfoProcedureCall;
}

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

function errorShape(
  scope: RequestScope,
  error: TRPCError,
  source: ErrorSource,
) {
  return getErrorShape({
    config: scope.config,
    ctx: ctxOf(scope),
    error,
    input: source.call?.result(),
    path: source.call?.path,
    type: source.type,
  });
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
  return attempt(() =>
    getRequestInfo({
      req: opts.req,
      path: urlPathToProcedurePath(path.value, config.pathSeparator),
      router: opts.router,
      searchParams: url.searchParams,
      headers: opts.req.headers,
      url,
      maxBatchSize: opts.maxBatchSize,
    }),
  );
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
  const { opts, headers, info } = request;
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
    headers.set('allow', accepted.join(', '));
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

/**
 * Runs `responseMeta` and adds its headers, returning the status. `results`
 * is `null` for streamed responses, which start before the results are known.
 */
function applyResponseMeta(
  scope: RequestScope,
  results: {
    data: TRPCResponse[];
    /** aligned with `data` by index; `undefined` for successful responses */
    errors: (TRPCError | undefined)[];
  } | null,
): number {
  const { opts, info, headers } = scope;
  const meta =
    opts.responseMeta?.({
      ctx: ctxOf(scope),
      info,
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
  const { info, headers } = request;
  headers.set('content-type', 'application/json');
  const results = await Promise.all(calls);

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
    const call = info.calls[index]!;
    // a single call's error gets the request's type, which is always
    // `mutation` for form data and binary bodies
    const source = info.isBatchCall
      ? sourceOf(call)
      : { type: info.type, call };
    return { error: errorShape(request, outcome.error, source) };
  });

  const status = applyResponseMeta(request, {
    data,
    errors: outcomes.map((outcome) => (outcome.ok ? undefined : outcome.error)),
  });
  const body = transformTRPCResponse(
    request.config,
    info.isBatchCall ? data : data[0]!,
  );
  return ok(new Response(JSON.stringify(body), { status, headers }));
}

/**
 * `httpBatchStreamLink`: responds straight away, then streams each result
 * as it settles.
 */
function jsonlResponse(
  request: AcceptedRequest,
  calls: PendingCalls,
): Outcome<Response> {
  const { config, headers, info, lifetime } = request;
  headers.set('content-type', config.jsonl?.contentType ?? 'application/json');
  headers.set('transfer-encoding', 'chunked');
  const status = applyResponseMeta(request, null);

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
      const error = getTRPCErrorFromUnknown(cause.error);
      reportError(request, error, { type: info.type });
    },
    formatError(errorOpts) {
      // no need to call `onError` here as it will be propagated through the stream itself
      const source = sourceOf(info.calls[errorOpts.path[0] as number]!);
      const error = getTRPCErrorFromUnknown(errorOpts.error);
      return errorShape(request, error, source);
    },
  });

  return ok(
    new Response(batchStreamBody(stream, lifetime), { headers, status }),
  );
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
  const { config, opts, url, headers, info, lifetime } = request;
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
  for (const [key, value] of Object.entries(sseHeaders)) {
    headers.set(key, value);
  }
  const status = applyResponseMeta(request, null);

  const body = result.ok
    ? subscriptionBody(stream, {
        lifetime,
        call: result.value,
        maxDurationMs: config.sse?.maxDurationMs,
      })
    : stream;
  return ok(new Response(body, { headers, status }));
}

/**
 * The response for an error that fails the whole request, such as a
 * malformed request or a `responseMeta`, `errorFormatter` or transformer that
 * throws.
 */
function errorResponse(scope: RequestScope, error: TRPCError): Response {
  const source: ErrorSource = { type: scope.info?.type ?? 'unknown' };
  reportError(scope, error, source);

  const data: TRPCResponse = { error: errorShape(scope, error, source) };
  const body = JSON.stringify(transformTRPCResponse(scope.config, data));
  const status = applyResponseMeta(scope, { data: [data], errors: [error] });
  return new Response(body, { status, headers: scope.headers });
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
  const request: AcceptedRequest = {
    ...scope,
    info,
    ctx,
    lifetime: requestLifetime(scope.opts.req),
  };
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
    headers: new Headers([['vary', 'trpc-accept, accept']]),
  };
  const response = await settle(() => respond(scope));
  return response.ok ? response.value : errorResponse(scope, response.error);
}
