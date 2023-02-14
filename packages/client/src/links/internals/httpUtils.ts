import { ProcedureType } from '@trpc/server';
import { TRPCResponse } from '@trpc/server/rpc';
import { getFetch } from '../../getFetch';
import { getAbortController } from '../../internals/fetchHelpers';
import {
  AbortControllerEsque,
  FetchEsque,
  RequestInitEsque,
  ResponseEsque,
} from '../../internals/types';
import { HTTPHeaders, PromiseAndCancel, TRPCClientRuntime } from '../types';

export interface HTTPLinkOptions {
  url: string;
  /**
   * Add ponyfill for fetch
   */
  fetch?: FetchEsque;
  /**
   * Add ponyfill for AbortController
   */
  AbortController?: AbortControllerEsque | null;
  /**
   * Headers to be set on outgoing requests or a callback that of said headers
   * @link http://trpc.io/docs/v10/header
   */
  headers?: HTTPHeaders | (() => HTTPHeaders | Promise<HTTPHeaders>);
}

export interface ResolvedHTTPLinkOptions {
  url: string;
  fetch: FetchEsque;
  AbortController: AbortControllerEsque | null;
  /**
   * Headers to be set on outgoing request
   * @link http://trpc.io/docs/v10/header
   */
  headers: () => HTTPHeaders | Promise<HTTPHeaders>;
}

export function resolveHTTPLinkOptions(
  opts: HTTPLinkOptions,
): ResolvedHTTPLinkOptions {
  const headers = opts.headers || (() => ({}));
  return {
    url: opts.url,
    fetch: getFetch(opts.fetch),
    AbortController: getAbortController(opts.AbortController),
    headers: typeof headers === 'function' ? headers : () => headers,
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
  };
}

type GetInputOptions = {
  runtime: TRPCClientRuntime;
} & ({ inputs: unknown[] } | { input: unknown });

function getInput(opts: GetInputOptions) {
  return 'input' in opts
    ? opts.runtime.transformer.serialize(opts.input)
    : arrayToDict(
        opts.inputs.map((_input) => opts.runtime.transformer.serialize(_input)),
      );
}

export type HTTPBaseRequestOptions = ResolvedHTTPLinkOptions &
  GetInputOptions & {
    type: ProcedureType;
    path: string;
  };

export type GetUrl = (opts: HTTPBaseRequestOptions) => string;
export type GetBody = (
  opts: HTTPBaseRequestOptions,
) => RequestInitEsque['body'];

export type ContentOptions = {
  contentTypeHeader?: string;
  getUrl: GetUrl;
  getBody: GetBody;
};

export type HTTPRequestOptions = HTTPBaseRequestOptions & ContentOptions;

export const getUrl: GetUrl = (opts) => {
  let url = opts.url + '/' + opts.path;
  const queryParts: string[] = [];
  if ('inputs' in opts) {
    queryParts.push('batch=1');
  }
  if (opts.type === 'query') {
    const input = getInput(opts);
    if (input !== undefined) {
      queryParts.push(`input=${encodeURIComponent(JSON.stringify(input))}`);
    }
  }
  if (queryParts.length) {
    url += '?' + queryParts.join('&');
  }
  return url;
};

export const getBody: GetBody = (opts) => {
  if (opts.type === 'query') {
    return undefined;
  }
  const input = getInput(opts);
  return input !== undefined ? JSON.stringify(input) : undefined;
};

export type Requester = (
  opts: HTTPBaseRequestOptions,
) => PromiseAndCancel<HTTPResult>;

export const jsonHttpRequester: Requester = (opts) => {
  return httpRequest({
    ...opts,
    contentTypeHeader: 'application/json',
    getUrl,
    getBody,
  });
};

export function httpRequest(
  opts: HTTPRequestOptions,
): PromiseAndCancel<HTTPResult> {
  const { type } = opts;
  const ac = opts.AbortController ? new opts.AbortController() : null;

  const promise = new Promise<HTTPResult>((resolve, reject) => {
    const url = opts.getUrl(opts);
    const body = opts.getBody(opts);

    const meta = {} as HTTPResult['meta'];
    Promise.resolve(opts.headers())
      .then((headers) => {
        /* istanbul ignore if  */
        if (type === 'subscription') {
          throw new Error('Subscriptions should use wsLink');
        }

        return opts.fetch(url, {
          method: METHOD[type],
          signal: ac?.signal,
          body: body,
          headers: {
            ...(opts.contentTypeHeader
              ? { 'content-type': opts.contentTypeHeader }
              : {}),
            ...headers,
          },
        });
      })
      .then((_res) => {
        meta.response = _res;
        return _res.json();
      })
      .then((json) => {
        resolve({
          json: json as TRPCResponse,
          meta,
        });
      })
      .catch(reject);
  });
  const cancel = () => {
    ac?.abort();
  };
  return { promise, cancel };
}
