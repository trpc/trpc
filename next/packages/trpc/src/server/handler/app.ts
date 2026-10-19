import { Cause, Context, Effect, Option, Tracer } from 'effect';
import {
  HttpServerRequest,
  HttpTraceContext,
  type HttpMiddleware,
  type HttpServerResponse,
} from 'effect/http';
import { HEADER, PROTOCOL_VERSION } from '../../internal/protocol.ts';
import { normalizeCause } from '../execution/index.ts';
import { batched } from './batch.ts';
import { singleCall } from './call.ts';
import { protocolError, type HttpHandler } from './http-handler.ts';
import { errorResponse } from './responses.ts';

/** What `HttpApp` holds. @internal */
export interface HttpAppShape {
  readonly app: Effect.Effect<
    HttpServerResponse.HttpServerResponse,
    never,
    HttpServerRequest.HttpServerRequest
  >;
  readonly middleware: ReadonlyArray<HttpMiddleware.HttpMiddleware>;
  /** The path prefix the app serves, which upgrades must target. */
  readonly endpoint?: string | undefined;
}

/** @internal */
export interface HttpApp {
  readonly _: unique symbol;
}

/** The `effect/http` app behind one of our handlers, for `@trpc12/trpc/http`. @internal */
export const HttpApp: Context.ServiceClass<
  HttpApp,
  '@trpc12/trpc/HttpApp',
  HttpAppShape
> = Context.Service<HttpApp, HttpAppShape>()('@trpc12/trpc/HttpApp');

/**
 * A request URL's pathname and search, as `new URL(url, base)` gives them.
 * Node's `/path?query` form is split by hand; anything that `URL` would
 * resolve differently (dot segments, `//`, backslashes, absolute URLs) goes
 * through `URL`.
 */
const splitUrl = (url: string): { pathname: string; search: string } => {
  if (
    url.charCodeAt(0) === 47 &&
    url.charCodeAt(1) !== 47 &&
    !url.includes('/.') &&
    !url.includes('\\') &&
    !url.includes('#')
  ) {
    const q = url.indexOf('?');
    return q === -1
      ? { pathname: url, search: '' }
      : { pathname: url.slice(0, q), search: url.slice(q) };
  }
  const parsed = new URL(url, 'http://localhost');
  return { pathname: parsed.pathname, search: parsed.search };
};

/** A procedure path from the URL, or `undefined` when its escapes are malformed. */
const decodePath = (raw: string): string | undefined => {
  try {
    return decodeURIComponent(raw);
  } catch {
    return undefined;
  }
};

/**
 * The span an HTTP call's span is a child of: the request's span (Effect's
 * HTTP tracer middleware makes one from `traceparent`), else the trace
 * context in the request's headers.
 * @internal
 */
export const parentSpan = (
  request: HttpServerRequest.HttpServerRequest,
): Effect.Effect<Tracer.AnySpan | undefined> =>
  Effect.map(
    Effect.serviceOption(Tracer.ParentSpan),
    (span) =>
      Option.getOrUndefined(span) ??
      Option.getOrUndefined(HttpTraceContext.fromHeaders(request.headers)),
  );

/**
 * The handler as an `effect/http` app: the protocol version, the endpoint,
 * then a batch or one call. What fails or dies is reported and sent as the
 * error response; an interruption (the client left) stays one.
 * @internal
 */
export const makeApp = (handler: HttpHandler): HttpAppShape['app'] =>
  Effect.flatMap(HttpServerRequest.HttpServerRequest, (request) => {
    const parts = splitUrl(request.url);
    const { pathname } = parts;
    const version = request.headers[HEADER.version];
    if (version !== undefined && version !== PROTOCOL_VERSION) {
      return Effect.fail(
        protocolError(
          'UNSUPPORTED_PROTOCOL',
          `Unsupported protocol version "${version}", expected "${PROTOCOL_VERSION}"`,
        ),
      );
    }
    if (pathname !== handler.endpoint && !pathname.startsWith(handler.under)) {
      return Effect.fail(protocolError('NOT_FOUND', `Not found: ${pathname}`));
    }
    const rest = pathname.slice(handler.under.length);
    const path = decodePath(rest);
    if (path === undefined) {
      return Effect.fail(protocolError('NOT_FOUND', `Not found: ${pathname}`));
    }
    return Effect.flatMap(parentSpan(request), (parent) =>
      rest === '' && request.headers[HEADER.batch] === '1'
        ? batched(handler, request, parent)
        : singleCall(handler, request, parts.search, path, parent),
    );
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.flatMap(HttpServerRequest.HttpServerRequest, (request) => {
        if (Cause.hasInterruptsOnly(cause)) return Effect.failCause(cause);
        const err = normalizeCause(cause);
        handler.core.report(err, request);
        return Effect.succeed(errorResponse(handler, err));
      }),
    ),
  ) as never;
