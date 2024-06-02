import type {
  AnyRootTypes,
  CombinedDataTransformer,
  ProcedureType,
  TRPCResponse,
} from '@trpc/server/unstable-core-do-not-import';
import { getFetch } from '../../getFetch';
import { getAbortController } from '../../internals/getAbortController';
import type {
  AbortControllerEsque,
  AbortControllerInstanceEsque,
  FetchEsque,
  RequestInitEsque,
  ResponseEsque,
} from '../../internals/types';
import { TRPCClientError } from '../../TRPCClientError';
import type { TransformerOptions } from '../../unstable-internals';
import { getTransformer } from '../../unstable-internals';
import type { HTTPHeaders, PromiseAndCancel } from '../types';

/**
 * @internal
 */
export type HTTPLinkBaseOptions<
  TRoot extends Pick<AnyRootTypes, 'transformer'>,
> = {
  url: string | URL;
  /**
   * Add ponyfill for fetch
   */
  fetch?: FetchEsque;
  /**
   * Add ponyfill for AbortController
   */
  AbortController?: AbortControllerEsque | null;
  /**
   * Send all requests `as POST`s requests regardless of the procedure type
   * The HTTP handler must separately allow overriding the method. See:
   * @link https://trpc.io/docs/rpc
   */
  methodOverride?: 'POST';
} & TransformerOptions<TRoot>;

export interface ResolvedHTTPLinkOptions {
  url: string;
  fetch?: FetchEsque;
  AbortController: AbortControllerEsque | null;
  transformer: CombinedDataTransformer;
  methodOverride?: 'POST';
}

export function resolveHTTPLinkOptions(
  opts: HTTPLinkBaseOptions<AnyRootTypes>,
): ResolvedHTTPLinkOptions {
  return {
    url: opts.url.toString().replace(/\/$/, ''), // Remove any trailing slashes
    fetch: opts.fetch,
    AbortController: getAbortController(opts.AbortController),
    transformer: getTransformer(opts.transformer),
    methodOverride: opts.methodOverride,
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
  };

type GetUrl = (opts: HTTPBaseRequestOptions) => string;
type GetBody = (opts: HTTPBaseRequestOptions) => RequestInitEsque['body'];

export type ContentOptions = {
  trpcAcceptHeader?: 'application/jsonl';
  contentTypeHeader?: string;
  getUrl: GetUrl;
  getBody: GetBody;
};

export const getUrl: GetUrl = (opts) => {
  let url = opts.url + '/' + opts.path;
  const queryParts: string[] = [];
  if ('inputs' in opts) {
    queryParts.push('batch=1');
  }
  if (opts.type === 'query') {
    const input = getInput(opts);
    if (input !== undefined && opts.methodOverride !== 'POST') {
      queryParts.push(`input=${encodeURIComponent(JSON.stringify(input))}`);
    }
  }
  if (queryParts.length) {
    url += '?' + queryParts.join('&');
  }
  return url;
};

export const getBody: GetBody = (opts) => {
  if (opts.type === 'query' && opts.methodOverride !== 'POST') {
    return undefined;
  }
  const input = getInput(opts);
  return input !== undefined ? JSON.stringify(input) : undefined;
};

export type Requester = (
  opts: HTTPBaseRequestOptions & {
    headers: () => HTTPHeaders | Promise<HTTPHeaders>;
  },
) => PromiseAndCancel<HTTPResult>;

export const jsonHttpRequester: Requester = (opts) => {
  return httpRequest({
    ...opts,
    contentTypeHeader: 'application/json',
    getUrl,
    getBody,
  });
};

export type HTTPRequestOptions = ContentOptions &
  HTTPBaseRequestOptions & {
    headers: () => HTTPHeaders | Promise<HTTPHeaders>;
  };

export async function fetchHTTPResponse(
  opts: HTTPRequestOptions,
  ac?: AbortControllerInstanceEsque | null,
) {
  const url = opts.getUrl(opts);
  const body = opts.getBody(opts);
  const { type } = opts;
  const resolvedHeaders = await (async () => {
    const heads = await opts.headers();
    if (Symbol.iterator in heads) {
      return Object.fromEntries(heads);
    }
    return heads;
  })();
  /* istanbul ignore if -- @preserve */
  if (type === 'subscription') {
    throw new Error('Subscriptions should use wsLink');
  }
  const headers = {
    ...(opts.contentTypeHeader
      ? { 'content-type': opts.contentTypeHeader }
      : {}),
    ...(opts.trpcAcceptHeader
      ? { 'trpc-accept': opts.trpcAcceptHeader }
      : undefined),
    ...resolvedHeaders,
  };

  return getFetch(opts.fetch)(url, {
    method: opts.methodOverride ?? METHOD[type],
    signal: ac?.signal,
    body,
    headers,
  });
}

export function httpRequest(
  opts: HTTPRequestOptions,
): PromiseAndCancel<HTTPResult> {
  const ac = opts.AbortController ? new opts.AbortController() : null;
  const meta = {} as HTTPResult['meta'];

  let done = false;
  const promise = new Promise<HTTPResult>((resolve, reject) => {
    fetchHTTPResponse(opts, ac)
      .then((_res) => {
        meta.response = _res;
        done = true;
        return _res.json();
      })
      .then((json) => {
        meta.responseJSON = json;
        resolve({
          json: json as TRPCResponse,
          meta,
        });
      })
      .catch((err) => {
        done = true;
        reject(TRPCClientError.from(err, { meta }));
      });
  });
  const cancel = () => {
    if (!done) {
      ac?.abort();
    }
  };
  return { promise, cancel };
}
