/**
 * Serve a fetch handler on AWS Lambda (`@trpc12/trpc/aws-lambda`): API Gateway
 * REST and HTTP APIs, function URLs, Application Load Balancers and
 * Lambda@Edge. Events become web `Request`s and responses become the
 * event's result shape; `toLambdaStreamingHandler` streams responses
 * (subscriptions, streamed outputs) where Lambda supports it.
 *
 * @example
 * ```ts
 * import { toLambdaHandler, type LambdaPlatform } from '@trpc12/trpc/aws-lambda';
 *
 * const handler = createFetchHandler<AppRouter, LambdaPlatform>({
 *   router,
 *   createContext: ({ platform }) => ({ requestId: platform.context.awsRequestId }),
 * });
 * export const main = toLambdaHandler(handler);
 * ```
 * @module
 */
import { Effect, Stream } from 'effect';

/**
 * An API Gateway REST API (payload 1.0) or Application Load Balancer event.
 * @example
 * ```ts
 * const event: LambdaV1Event = { httpMethod: 'GET', path: '/trpc/health', headers: {}, body: null };
 * ```
 * @since 0.1.0
 * @stability stable
 */
export interface LambdaV1Event {
  readonly httpMethod: string;
  readonly path: string;
  readonly headers?: Readonly<Record<string, string | undefined>> | null;
  readonly multiValueHeaders?: Readonly<
    Record<string, ReadonlyArray<string> | undefined>
  > | null;
  readonly queryStringParameters?: Readonly<
    Record<string, string | undefined>
  > | null;
  readonly multiValueQueryStringParameters?: Readonly<
    Record<string, ReadonlyArray<string> | undefined>
  > | null;
  readonly body?: string | null;
  readonly isBase64Encoded?: boolean;
  readonly requestContext?: {
    readonly domainName?: string;
    readonly elb?: unknown;
  };
}

/**
 * An API Gateway HTTP API (payload 2.0) or function URL event.
 * @example
 * ```ts
 * const event: LambdaV2Event = {
 *   version: '2.0', rawPath: '/trpc/health', rawQueryString: '', headers: {},
 *   requestContext: { http: { method: 'GET' } },
 * };
 * ```
 * @since 0.1.0
 * @stability stable
 */
export interface LambdaV2Event {
  readonly version: '2.0';
  readonly rawPath: string;
  readonly rawQueryString: string;
  readonly headers?: Readonly<Record<string, string | undefined>>;
  readonly cookies?: ReadonlyArray<string>;
  readonly body?: string;
  readonly isBase64Encoded?: boolean;
  readonly requestContext: {
    readonly http: { readonly method: string };
    readonly domainName?: string;
  };
}

interface CloudFrontHeaders {
  readonly [name: string]: ReadonlyArray<{
    readonly key?: string;
    readonly value: string;
  }>;
}

/**
 * A Lambda@Edge viewer or origin request event. The body is there only
 * when the CloudFront behavior includes it.
 * @example
 * ```ts
 * const event: LambdaEdgeEvent = {
 *   Records: [{ cf: { request: { method: 'GET', uri: '/trpc/health', querystring: '', headers: {} } } }],
 * };
 * ```
 * @since 0.1.0
 * @stability stable
 */
export interface LambdaEdgeEvent {
  readonly Records: ReadonlyArray<{
    readonly cf: {
      readonly request: {
        readonly method: string;
        readonly uri: string;
        readonly querystring: string;
        readonly headers: CloudFrontHeaders;
        readonly body?: {
          readonly data: string;
          readonly encoding: 'base64' | 'text';
        };
      };
    };
  }>;
}

/**
 * The events {@link toLambdaHandler} accepts.
 * @example
 * ```ts
 * export const main = (event: LambdaEvent, context: LambdaContext) => lambda(event, context);
 * ```
 * @since 0.1.0
 * @stability stable
 */
export type LambdaEvent = LambdaV1Event | LambdaV2Event | LambdaEdgeEvent;

/**
 * The parts of Lambda's context object the adapter reads; the whole
 * object reaches `createContext` as `platform.context`.
 * @example
 * ```ts
 * createContext: ({ platform }) => ({ requestId: platform.context.awsRequestId })
 * ```
 * @since 0.1.0
 * @stability stable
 */
export interface LambdaContext {
  readonly awsRequestId?: string;
  /** Aborts the call shortly before Lambda times out. */
  getRemainingTimeInMillis?(): number;
}

/**
 * The handler's platform argument on Lambda.
 * @example
 * ```ts
 * createFetchHandler<AppRouter, LambdaPlatform>({ router, createContext: ({ platform }) => ({ event: platform.event }) });
 * ```
 * @since 0.1.0
 * @stability stable
 */
export interface LambdaPlatform {
  readonly event: LambdaEvent;
  readonly context: LambdaContext;
}

/**
 * A REST API or ALB result.
 * @example
 * ```ts
 * const result: LambdaV1Result = { statusCode: 200, headers: {}, body: '"ok"', isBase64Encoded: false };
 * ```
 * @since 0.1.0
 * @stability stable
 */
export interface LambdaV1Result {
  readonly statusCode: number;
  readonly statusDescription?: string;
  readonly headers: Record<string, string>;
  readonly multiValueHeaders: Record<string, Array<string>>;
  readonly body: string;
  readonly isBase64Encoded: boolean;
}

/**
 * An HTTP API or function URL result.
 * @example
 * ```ts
 * const result: LambdaV2Result = { statusCode: 200, headers: {}, cookies: [], body: '"ok"', isBase64Encoded: false };
 * ```
 * @since 0.1.0
 * @stability stable
 */
export interface LambdaV2Result {
  readonly statusCode: number;
  readonly headers: Record<string, string>;
  readonly cookies: Array<string>;
  readonly body: string;
  readonly isBase64Encoded: boolean;
}

/**
 * A Lambda@Edge result.
 * @example
 * ```ts
 * const result: LambdaEdgeResult = { status: '200', headers: {}, body: '"ok"', bodyEncoding: 'text' };
 * ```
 * @since 0.1.0
 * @stability stable
 */
export interface LambdaEdgeResult {
  readonly status: string;
  readonly headers: Record<string, Array<{ key: string; value: string }>>;
  readonly body: string;
  readonly bodyEncoding: 'base64' | 'text';
}

/**
 * What {@link toLambdaHandler} resolves with, matching the event's shape.
 * @example
 * ```ts
 * const result: LambdaResult = await lambda(event, context);
 * ```
 * @since 0.1.0
 * @stability stable
 */
export type LambdaResult = LambdaV1Result | LambdaV2Result | LambdaEdgeResult;

/**
 * A fetch handler that accepts the Lambda platform, like
 * `createFetchHandler<AppRouter, LambdaPlatform>()` or one without a
 * platform type.
 * @example
 * ```ts
 * const handler: LambdaFetchHandler = createFetchHandler({ router });
 * ```
 * @since 0.1.0
 * @stability stable
 */
export interface LambdaFetchHandler {
  fetch(request: Request, platform: LambdaPlatform): Promise<Response>;
}

/**
 * Options for {@link toLambdaHandler} and {@link toLambdaStreamingHandler}.
 * @example
 * ```ts
 * toLambdaHandler(handler, { timeoutMarginMs: 500 });
 * ```
 * @since 0.1.0
 * @stability stable
 */
export interface LambdaHandlerOptions {
  /**
   * Abort the call this long before Lambda's deadline, so it ends with an
   * error response instead of a timeout.
   * @default 1000
   */
  readonly timeoutMarginMs?: number;
}

const isV2 = (event: LambdaEvent): event is LambdaV2Event =>
  'version' in event && event.version === '2.0';
const isEdge = (event: LambdaEvent): event is LambdaEdgeEvent =>
  'Records' in event;
const isAlb = (event: LambdaV1Event) => event.requestContext?.elb !== undefined;

const decodeBase64 = (data: string): Uint8Array =>
  Uint8Array.from(atob(data), (c) => c.charCodeAt(0));

const encodeBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};

const isText = (type: string | null): boolean =>
  type !== null &&
  /^(text\/|application\/(json|jsonl|x-www-form-urlencoded|xml|javascript)\b|[^;]*\+json\b)/i.test(
    type,
  );

const bodyOf = (
  data: string | null | undefined,
  base64: boolean | undefined,
): BodyInit | undefined =>
  data === undefined || data === null || data === ''
    ? undefined
    : base64
      ? (decodeBase64(data) as BodyInit)
      : data;

const v1Request = (event: LambdaV1Event, signal: AbortSignal): Request => {
  const headers = new Headers();
  for (const [k, vs] of Object.entries(event.multiValueHeaders ?? {})) {
    for (const v of vs ?? []) headers.append(k, v);
  }
  for (const [k, v] of Object.entries(event.headers ?? {})) {
    if (v !== undefined && !headers.has(k)) headers.set(k, v);
  }
  const alb = isAlb(event);
  const params: string[] = [];
  const multi = event.multiValueQueryStringParameters;
  const pairs: Array<[string, string]> = multi
    ? Object.entries(multi).flatMap(([k, vs]) =>
        (vs ?? []).map((v): [string, string] => [k, v]),
      )
    : Object.entries(event.queryStringParameters ?? {}).flatMap(([k, v]) =>
        v === undefined ? [] : [[k, v] as [string, string]],
      );
  // ALB passes the query string as sent; API Gateway decodes it.
  for (const [k, v] of pairs) {
    params.push(
      alb ? `${k}=${v}` : `${encodeURIComponent(k)}=${encodeURIComponent(v)}`,
    );
  }
  const host =
    headers.get('host') ?? event.requestContext?.domainName ?? 'localhost';
  const query = params.length > 0 ? `?${params.join('&')}` : '';
  const method = event.httpMethod.toUpperCase();
  return new Request(`https://${host}${event.path}${query}`, {
    method,
    headers,
    body:
      method === 'GET' || method === 'HEAD'
        ? undefined
        : bodyOf(event.body, event.isBase64Encoded),
    signal,
  });
};

const v2Request = (event: LambdaV2Event, signal: AbortSignal): Request => {
  const headers = new Headers();
  for (const [k, v] of Object.entries(event.headers ?? {})) {
    if (v !== undefined) headers.set(k, v);
  }
  if (event.cookies && event.cookies.length > 0) {
    headers.set('cookie', event.cookies.join('; '));
  }
  const host =
    headers.get('host') ?? event.requestContext.domainName ?? 'localhost';
  const query = event.rawQueryString ? `?${event.rawQueryString}` : '';
  const method = event.requestContext.http.method.toUpperCase();
  return new Request(`https://${host}${event.rawPath}${query}`, {
    method,
    headers,
    body:
      method === 'GET' || method === 'HEAD'
        ? undefined
        : bodyOf(event.body, event.isBase64Encoded),
    signal,
  });
};

const edgeRequest = (event: LambdaEdgeEvent, signal: AbortSignal): Request => {
  const cf = event.Records[0]!.cf.request;
  const headers = new Headers();
  for (const [k, vs] of Object.entries(cf.headers)) {
    for (const { value } of vs) headers.append(k, value);
  }
  const host = headers.get('host') ?? 'localhost';
  const query = cf.querystring ? `?${cf.querystring}` : '';
  const method = cf.method.toUpperCase();
  return new Request(`https://${host}${cf.uri}${query}`, {
    method,
    headers,
    body:
      method === 'GET' || method === 'HEAD' || !cf.body
        ? undefined
        : bodyOf(cf.body.data, cf.body.encoding === 'base64'),
    signal,
  });
};

/** The web `Request` for a Lambda event. */
const toRequest = (event: LambdaEvent, signal: AbortSignal): Request =>
  isEdge(event)
    ? edgeRequest(event, signal)
    : isV2(event)
      ? v2Request(event, signal)
      : v1Request(event, signal);

const deadline = (
  context: LambdaContext,
  margin: number,
): Effect.Effect<AbortSignal> =>
  Effect.sync(() => {
    const remaining = context.getRemainingTimeInMillis?.();
    return remaining === undefined
      ? new AbortController().signal
      : AbortSignal.timeout(Math.max(0, remaining - margin));
  });

const toResult = (
  event: LambdaEvent,
  response: Response,
): Effect.Effect<LambdaResult> =>
  Effect.gen(function* () {
    const bytes = new Uint8Array(
      yield* Effect.promise(() => response.arrayBuffer()),
    );
    const text = isText(response.headers.get('content-type'));
    const body = text ? new TextDecoder().decode(bytes) : encodeBase64(bytes);
    const cookies = response.headers.getSetCookie();
    const headers: Record<string, string> = {};
    for (const [k, v] of response.headers) {
      if (k !== 'set-cookie') headers[k] = v;
    }
    if (isEdge(event)) {
      const edge: LambdaEdgeResult['headers'] = {};
      for (const [k, v] of Object.entries(headers)) {
        edge[k] = [{ key: k, value: v }];
      }
      if (cookies.length > 0) {
        edge['set-cookie'] = cookies.map((value) => ({
          key: 'set-cookie',
          value,
        }));
      }
      return {
        status: String(response.status),
        headers: edge,
        body,
        bodyEncoding: text ? 'text' : 'base64',
      } satisfies LambdaEdgeResult;
    }
    if (isV2(event)) {
      return {
        statusCode: response.status,
        headers,
        cookies,
        body,
        isBase64Encoded: !text,
      } satisfies LambdaV2Result;
    }
    const multiValueHeaders: Record<string, Array<string>> = {};
    if (cookies.length > 0) multiValueHeaders['set-cookie'] = cookies;
    return {
      statusCode: response.status,
      ...(isAlb(event)
        ? {
            statusDescription:
              `${response.status} ${response.statusText}`.trim(),
          }
        : {}),
      headers,
      multiValueHeaders,
      body,
      isBase64Encoded: !text,
    } satisfies LambdaV1Result;
  });

/**
 * A Lambda handler for a fetch handler: the event becomes a web
 * `Request`, `{ event, context }` is the handler's platform argument, and
 * the buffered response becomes the event's result shape. Text bodies
 * (JSON, JSONL, forms, `text/*`) stay text; others are base64.
 *
 * Buffered responses arrive whole, so subscriptions and streamed outputs
 * only reach the client once they end; use
 * {@link toLambdaStreamingHandler} or a WebSocket API for those.
 *
 * @example
 * ```ts
 * export const main = toLambdaHandler(createFetchHandler({ router }));
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function toLambdaHandler(
  handler: LambdaFetchHandler,
  options: LambdaHandlerOptions = {},
): (event: LambdaEvent, context?: LambdaContext) => Promise<LambdaResult> {
  const margin = options.timeoutMarginMs ?? 1000;
  return (event, context = {}) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const signal = yield* deadline(context, margin);
        const response = yield* Effect.promise(() =>
          handler.fetch(toRequest(event, signal), { event, context }),
        );
        return yield* toResult(event, response);
      }),
    );
}

/**
 * The writable stream Lambda's response streaming passes the handler.
 * @example
 * ```ts
 * export const main = awslambda.streamifyResponse(toLambdaStreamingHandler(handler));
 * ```
 * @since 0.1.0
 * @stability stable
 */
export interface LambdaResponseStream {
  write(chunk: Uint8Array): boolean;
  end(): void;
  setContentType?(type: string): void;
  once?(event: 'drain', listener: () => void): unknown;
}

const PRELUDE_TYPE = 'application/vnd.awslambda.http-integration-response';

const write = (stream: LambdaResponseStream, chunk: Uint8Array) =>
  Effect.callback<void>((resume) => {
    if (stream.write(chunk) || !stream.once) resume(Effect.void);
    else stream.once('drain', () => resume(Effect.void));
  });

/**
 * A response-streaming Lambda handler (function URLs with
 * `InvokeMode: RESPONSE_STREAM`, API Gateway REST streaming): status and
 * headers go first, then the body as the handler produces it, so SSE
 * subscriptions and JSONL outputs stream. Wrap it with
 * `awslambda.streamifyResponse`.
 *
 * @example
 * ```ts
 * export const main = awslambda.streamifyResponse(
 *   toLambdaStreamingHandler(createFetchHandler({ router })),
 * );
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function toLambdaStreamingHandler(
  handler: LambdaFetchHandler,
  options: LambdaHandlerOptions = {},
): (
  event: LambdaEvent,
  stream: LambdaResponseStream,
  context?: LambdaContext,
) => Promise<void> {
  const margin = options.timeoutMarginMs ?? 1000;
  return (event, stream, context = {}) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const signal = yield* deadline(context, margin);
        const response = yield* Effect.promise(() =>
          handler.fetch(toRequest(event, signal), { event, context }),
        );
        const headers: Record<string, string> = {};
        for (const [k, v] of response.headers) {
          if (k !== 'set-cookie') headers[k] = v;
        }
        const prelude = JSON.stringify({
          statusCode: response.status,
          headers,
          cookies: response.headers.getSetCookie(),
        });
        stream.setContentType?.(PRELUDE_TYPE);
        yield* write(stream, new TextEncoder().encode(prelude));
        yield* write(stream, new Uint8Array(8));
        if (response.body) {
          yield* Stream.fromReadableStream({
            evaluate: () => response.body!,
            onError: (cause) => cause,
          }).pipe(
            Stream.runForEach((chunk) => write(stream, chunk)),
            Effect.ignore,
          );
        }
      }).pipe(Effect.ensuring(Effect.sync(() => stream.end()))),
    );
}
