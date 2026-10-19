import {
  codeOfStatus,
  fromWireError,
  isTrpcError,
  TrpcError,
  type AnyTrpcError,
} from '../../../internal/error.ts';
import {
  CONTENT_TYPE,
  HEADER,
  PROTOCOL_VERSION,
  readBlob,
  toInputSearch,
} from '../../../internal/protocol.ts';
import type { FormOfOptions, MaybePromise } from '../../../internal/types.ts';
import type {
  AnySerializer,
  SerializeOpts,
  SerializeReturn,
} from '../../../serializer/index.ts';
import {
  promiseLink,
  toClientError,
  withSerializer,
  type PromiseLink,
} from '../../chain.ts';
import type { Operation, TrpcRequestInit } from '../../link.ts';

/**
 * Options for {@link httpLink}.
 * @since 0.1.0
 * @stability stable
 */
export interface HttpLinkOptions<
  TSerializer extends AnySerializer = AnySerializer,
> {
  /** The endpoint, e.g. `http://localhost:3000/trpc`. */
  url: string | URL;
  /**
   * Must match the handler's; a response from a handler with another one
   * fails with `UNSUPPORTED_PROTOCOL`. Client types follow it. Outputs that
   * stream (nested `Promise`s, `AsyncIterable`s) need `httpStreamLink`,
   * whatever the serializer.
   * @default jsonSerializer
   */
  serializer?: TSerializer | undefined;
  /** Extra headers, merged with each call's `context.headers`. */
  headers?:
    | HeadersInit
    | ((opts: { ops: ReadonlyArray<Operation> }) => MaybePromise<HeadersInit>);
  /**
   * Default `fetch` options, called once per request with the call it
   * carries. The call's `init` is merged onto it: shallowly, except
   * `headers` and `next`, which merge one level deeper.
   */
  init?:
    | TrpcRequestInit
    | ((opts: {
        ops: ReadonlyArray<Operation>;
      }) => MaybePromise<TrpcRequestInit | undefined>);
  /** A custom `fetch`. */
  fetch?: typeof globalThis.fetch;
  /**
   * Queries whose URL would be longer than this are sent with a body, as
   * `longQuery` says.
   * @default 2048
   */
  maxUrlLength?: number;
  /**
   * How a query too long for a URL is sent: `POST`, or the HTTP `QUERY`
   * method. `QUERY` needs every proxy in between to allow it.
   * @default 'post'
   */
  longQuery?: 'post' | 'query';
}

/**
 * What `httpLink` declares: its serializer's form, the responses it reports
 * to `onResponse`, the errors it makes (`NETWORK_ERROR` when `fetch` fails,
 * `BAD_RESPONSE` for a page that isn't tRPC's, a body that doesn't decode or
 * an output that streams), and no subscriptions.
 * @since 0.1.0
 * @stability stable
 */
export type HttpLinkDecl<TOpts> = {
  form: FormOfOptions<TOpts>;
  provides: 'response';
  builtinErrors: 'NETWORK_ERROR' | 'BAD_RESPONSE';
  unsupported: 'subscription';
};

interface Codec {
  readonly name: string;
  serialize(value: unknown, opts?: SerializeOpts): SerializeReturn;
  deserialize(value: SerializeReturn): unknown;
}

/** `jsonSerializer`'s wire format, without the stream support it carries. */
const json: Codec = {
  name: 'json',
  serialize: (value: unknown): SerializeReturn => {
    const text = JSON.stringify(value, (_key, v: unknown) => {
      if (v instanceof Blob) {
        throw new TypeError(
          'A File or Blob needs a streaming serializer such as createSerializer(); a root file output can be a raw response instead',
        );
      }
      return v;
    });
    return text === undefined ? {} : { json: JSON.parse(text) as never };
  },
  deserialize: (value: SerializeReturn): unknown => value.json,
};

function toHttpError(cause: unknown): AnyTrpcError {
  if (isTrpcError(cause)) return cause;
  return new TrpcError(
    cause instanceof Error && cause.name === 'AbortError'
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
}

const unsupported: AsyncIterable<never> = {
  [Symbol.asyncIterator]: () => ({
    next: () =>
      Promise.reject(
        new TrpcError({
          code: 'METHOD_NOT_SUPPORTED',
          message:
            'httpLink carries queries and mutations: use httpStreamLink for subscriptions',
        }),
      ),
  }),
};

/**
 * Sends queries and mutations over HTTP with `fetch`, and no Effect: a
 * query is a `GET` with an `?input=` param (a body past `maxUrlLength`), a
 * mutation a `POST`. A call whose input holds a `File` or `Blob` (with a
 * serializer that writes them) is sent as `multipart/form-data`, and a
 * `ReadableStream` input (for `experimental_byteStream()`) as the raw
 * `application/octet-stream` body. For
 * batching, subscriptions and outputs that stream, use `httpStreamLink`.
 *
 * @example
 * ```ts
 * createTrpcClient({
 *   router: routerType<AppRouter>(),
 *   links: [httpLink({ url: 'http://localhost:3000/trpc' })],
 * });
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function httpLink<TOpts extends HttpLinkOptions>(
  opts: TOpts,
): PromiseLink<HttpLinkDecl<TOpts>>;
export function httpLink(opts: HttpLinkOptions): PromiseLink<any> {
  const serializer: Codec = opts.serializer ?? json;
  const baseUrl = String(opts.url).replace(/\/+$/, '');
  const maxUrlLength = opts.maxUrlLength ?? 2048;
  const fetchFn = opts.fetch ?? globalThis.fetch;

  /** A tRPC error body, else a page from something in between. */
  const readError = async (res: Response): Promise<AnyTrpcError> => {
    const text = await res.text();
    let body: unknown;
    let cause: unknown;
    try {
      body = serializer.deserialize(JSON.parse(text) as SerializeReturn);
    } catch (err) {
      cause = err;
    }
    const error = (body as { error?: unknown } | null | undefined)?.error;
    return typeof error === 'object' && error !== null
      ? fromWireError(body)
      : new TrpcError({
          code: codeOfStatus(res.status) ?? 'BAD_RESPONSE',
          message: `Unexpected ${res.status} response`,
          cause: cause ?? body,
        });
  };

  /**
   * Headers, lowest first: `init()`'s, the link's `headers`, the call's
   * `init.headers`, the call's `headers`, then the protocol's.
   */
  const request = async (
    op: Operation,
    method: string,
    url: string,
    body: BodyInit | undefined,
    contentType?: string,
  ): Promise<Response> => {
    const ops = [op];
    const base =
      typeof opts.init === 'function' ? await opts.init({ ops }) : opts.init;
    const call = op.context.init;
    const headers = new Headers(base?.headers);
    const set = (init: HeadersInit | undefined) =>
      new Headers(init).forEach((v, k) => headers.set(k, v));
    set(
      typeof opts.headers === 'function'
        ? await opts.headers({ ops })
        : opts.headers,
    );
    set(call?.headers);
    set(op.context.headers);
    set(op.trace);
    headers.set(HEADER.version, PROTOCOL_VERSION);
    headers.set('accept', CONTENT_TYPE.json);
    if (contentType) headers.set('content-type', contentType);
    const next =
      base?.next || call?.next ? { ...base?.next, ...call?.next } : undefined;
    return fetchFn(url, {
      ...base,
      ...call,
      ...(next ? { next } : {}),
      method,
      headers,
      ...(body === undefined ? {} : { body }),
      ...(contentType === CONTENT_TYPE.octet ? { duplex: 'half' } : {}),
      signal: op.signal ?? null,
    } as RequestInit);
  };

  const send = async (op: Operation): Promise<Response> => {
    const url = `${baseUrl}/${op.path}`;
    if (
      typeof ReadableStream !== 'undefined' &&
      op.input instanceof ReadableStream
    ) {
      return request(op, 'POST', url, op.input, CONTENT_TYPE.octet);
    }
    const parts: Blob[] = [];
    let input: SerializeReturn | undefined;
    try {
      input =
        op.input === undefined
          ? undefined
          : serializer.serialize(op.input, { parts });
    } catch (cause) {
      throw new TrpcError({
        code: 'BAD_REQUEST',
        message: cause instanceof Error ? cause.message : 'Invalid input',
        cause,
      });
    }
    if (parts.length > 0) {
      const form = new FormData();
      form.append('input', JSON.stringify(input));
      for (const [i, blob] of parts.entries()) {
        form.append(String(i), blob, blob instanceof File ? blob.name : 'blob');
      }
      return request(op, 'POST', url, form);
    }
    const search =
      op.type === 'query' && input !== undefined ? toInputSearch(input) : '';
    const full = search ? `${url}?${search}` : url;
    return op.type === 'query' && full.length <= maxUrlLength
      ? request(op, 'GET', full, undefined)
      : request(
          op,
          op.type === 'query' && opts.longQuery === 'query' ? 'QUERY' : 'POST',
          url,
          input === undefined ? '' : JSON.stringify(input),
          CONTENT_TYPE.json,
        );
  };

  const read = async (op: Operation, res: Response): Promise<unknown> => {
    const theirs = res.headers.get(HEADER.serializer);
    if (theirs !== null && theirs !== serializer.name) {
      await res.body?.cancel().catch(() => {});
      throw new TrpcError({
        code: 'UNSUPPORTED_PROTOCOL',
        message: `The server uses the '${theirs}' serializer, but this httpLink uses '${serializer.name}'. Pass the same serializer to the handler and httpLink.`,
      });
    }
    try {
      op.context.onResponse?.({ status: res.status, headers: res.headers });
    } catch (cause) {
      throw toClientError(cause);
    }
    if (res.headers.get(HEADER.response) === '1') return res;
    if (!res.ok) throw await readError(res);
    const blob = res.headers.get(HEADER.blob);
    if (blob !== null) return readBlob(res, blob);
    const type = res.headers.get('content-type') ?? '';
    if (
      type.startsWith(CONTENT_TYPE.jsonl) ||
      type.startsWith(CONTENT_TYPE.frames)
    ) {
      await res.body?.cancel().catch(() => {});
      throw new TrpcError({
        code: 'BAD_RESPONSE',
        message: `"${op.path}" streams its output, which httpLink can't read: use httpStreamLink`,
      });
    }
    const text = await res.text();
    try {
      return text
        ? serializer.deserialize(JSON.parse(text) as SerializeReturn)
        : undefined;
    } catch (cause) {
      throw new TrpcError({
        code: 'BAD_RESPONSE',
        message: 'Invalid response body',
        cause,
      });
    }
  };

  return withSerializer(
    promiseLink((args) =>
      args.op.type === 'subscription'
        ? unsupported
        : send(args.op)
            .then((res) => read(args.op, res))
            .catch((cause: unknown) => Promise.reject(toHttpError(cause))),
    ),
    opts.serializer,
  );
}
