import type {
  AnyClientTypes,
  CombinedDataTransformer,
  Maybe,
  ProcedureType,
  TRPCAcceptHeader,
  TRPCResponse,
} from '@trpc/server/unstable-core-do-not-import';
import { getFetch } from '../../getFetch';
import type {
  FetchEsque,
  RequestInitEsque,
  ResponseEsque,
} from '../../internals/types';
import type { TransformerOptions } from '../../unstable-internals';
import { getTransformer } from '../../unstable-internals';
import type { HTTPHeaders } from '../types';

/**
 * @internal
 */
export type HTTPLinkBaseOptions<
  TRoot extends Pick<AnyClientTypes, 'transformer'>,
> = {
  url: string | URL;
  /**
   * Add ponyfill for fetch
   */
  fetch?: FetchEsque;
  /**
   * Send all requests `as POST`s requests regardless of the procedure type
   * The HTTP handler must separately allow overriding the method. See:
   * @see https://trpc.io/docs/rpc
   */
  methodOverride?: 'POST';
  /**
   * Use HTTP QUERY method for query procedures.
   * This allows sending input in the request body while maintaining safe/cacheable semantics.
   * The HTTP QUERY method (RFC 9110 extension) solves URL length limitations of GET
   * while preserving cacheability that POST lacks.
   * @see https://www.ietf.org/archive/id/draft-ietf-httpbis-safe-method-w-body-05.html
   */
  queryMethod?: 'GET' | 'QUERY';
} & TransformerOptions<TRoot>;

export interface ResolvedHTTPLinkOptions {
  url: string;
  fetch?: FetchEsque;
  transformer: CombinedDataTransformer;
  methodOverride?: 'POST';
  queryMethod?: 'GET' | 'QUERY';
}

export function resolveHTTPLinkOptions(
  opts: HTTPLinkBaseOptions<AnyClientTypes>,
): ResolvedHTTPLinkOptions {
  return {
    url: opts.url.toString(),
    fetch: opts.fetch,
    transformer: getTransformer(opts.transformer),
    methodOverride: opts.methodOverride,
    queryMethod: opts.queryMethod,
  };
}

// https://github.com/trpc/trpc/pull/669
function arrayToDict(array: unknown[]) {
  const dict: Record<number, unknown> = {};
  for (let index = 0; index < array.length; index++) {
    const element = array[index];
    dict[index] = element;
  }
  return dict;
}

const METHOD = {
  query: 'GET',
  mutation: 'POST',
  subscription: 'PATCH',
} as const;

export interface HTTPResult {
  json: TRPCResponse;
  meta: {
    response: ResponseEsque;
    responseJSON?: unknown;
  };
}

type GetInputOptions = {
  transformer: CombinedDataTransformer;
} & ({ input: unknown } | { inputs: unknown[] });

export function getInput(opts: GetInputOptions) {
  return 'input' in opts
    ? opts.transformer.input.serialize(opts.input)
    : arrayToDict(
        opts.inputs.map((_input) => opts.transformer.input.serialize(_input)),
      );
}

export type HTTPBaseRequestOptions = GetInputOptions &
  ResolvedHTTPLinkOptions & {
    type: ProcedureType;
    path: string;
    signal: Maybe<AbortSignal>;
  };

type GetUrl = (opts: HTTPBaseRequestOptions) => string;
type GetBody = (opts: HTTPBaseRequestOptions) => RequestInitEsque['body'];

export type ContentOptions = {
  trpcAcceptHeader?: TRPCAcceptHeader;
  trpcAcceptHeaderKey?: 'trpc-accept' | 'accept';
  contentTypeHeader?: string;
  getUrl: GetUrl;
  getBody: GetBody;
};

export const getUrl: GetUrl = (opts) => {
  const parts = opts.url.split('?') as [string, string?];
  const base = parts[0].replace(/\/$/, ''); // Remove any trailing slashes

  let url = base + '/' + opts.path;
  const queryParts: string[] = [];

  if (parts[1]) {
    queryParts.push(parts[1]);
  }
  if ('inputs' in opts) {
    queryParts.push('batch=1');
  }
  if (opts.type === 'query' || opts.type === 'subscription') {
    const input = getInput(opts);
    // Don't add input to query params if using methodOverride or queryMethod: 'QUERY'
    // (input goes in body instead)
    const inputInBody =
      opts.methodOverride === 'POST' || opts.queryMethod === 'QUERY';
    if (input !== undefined && !inputInBody) {
      queryParts.push(`input=${encodeURIComponent(JSON.stringify(input))}`);
    }
  }
  if (queryParts.length) {
    url += '?' + queryParts.join('&');
  }
  return url;
};

export const getBody: GetBody = (opts) => {
  // For queries, only include body if using methodOverride or queryMethod: 'QUERY'
  if (opts.type === 'query') {
    const inputInBody =
      opts.methodOverride === 'POST' || opts.queryMethod === 'QUERY';
    if (!inputInBody) {
      return undefined;
    }
  }
  const input = getInput(opts);
  return input !== undefined ? JSON.stringify(input) : undefined;
};

export type Requester = (
  opts: HTTPBaseRequestOptions & {
    headers: () => HTTPHeaders | Promise<HTTPHeaders>;
  },
) => Promise<HTTPResult>;

export const jsonHttpRequester: Requester = (opts) => {
  return httpRequest({
    ...opts,
    contentTypeHeader: 'application/json',
    getUrl,
    getBody,
  });
};

/**
 * Polyfill for DOMException with AbortError name
 */
class AbortError extends Error {
  constructor() {
    const name = 'AbortError';
    super(name);
    this.name = name;
    this.message = name;
  }
}

export type HTTPRequestOptions = ContentOptions &
  HTTPBaseRequestOptions & {
    headers: () => HTTPHeaders | Promise<HTTPHeaders>;
  };

/**
 * Polyfill for `signal.throwIfAborted()`
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/throwIfAborted
 */
const throwIfAborted = (signal: Maybe<AbortSignal>) => {
  if (!signal?.aborted) {
    return;
  }
  // If available, use the native implementation
  signal.throwIfAborted?.();

  // If we have `DOMException`, use it
  if (typeof DOMException !== 'undefined') {
    throw new DOMException('AbortError', 'AbortError');
  }

  // Otherwise, use our own implementation
  throw new AbortError();
};

export async function fetchHTTPResponse(opts: HTTPRequestOptions) {
  throwIfAborted(opts.signal);

  const url = opts.getUrl(opts);
  const body = opts.getBody(opts);
  // Determine HTTP method: methodOverride takes precedence, then queryMethod for queries
  const method =
    opts.methodOverride ??
    (opts.type === 'query' && opts.queryMethod === 'QUERY'
      ? 'QUERY'
      : METHOD[opts.type]);
  const resolvedHeaders = await (async () => {
    const heads = await opts.headers();
    if (Symbol.iterator in heads) {
      return Object.fromEntries(heads);
    }
    return heads;
  })();
  const headers = {
    // Include content-type for methods that have a body (not GET)
    ...(opts.contentTypeHeader && method !== 'GET'
      ? { 'content-type': opts.contentTypeHeader }
      : {}),
    ...(opts.trpcAcceptHeader
      ? { [opts.trpcAcceptHeaderKey ?? 'trpc-accept']: opts.trpcAcceptHeader }
      : undefined),
    ...resolvedHeaders,
  };

  return getFetch(opts.fetch)(url, {
    method,
    signal: opts.signal,
    body,
    headers,
  });
}

export async function httpRequest(
  opts: HTTPRequestOptions,
): Promise<HTTPResult> {
  const meta = {} as HTTPResult['meta'];

  const res = await fetchHTTPResponse(opts);
  meta.response = res;

  const json = await res.json();

  meta.responseJSON = json;

  return {
    json: json as TRPCResponse,
    meta,
  };
}
