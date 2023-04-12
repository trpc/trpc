import { ProcedureType } from '@trpc/server';
import { TRPCResponse } from '@trpc/server/rpc';
import { getFetch } from '../../getFetch';
import { getAbortController } from '../../internals/getAbortController';
import {
  AbortControllerEsque,
  FetchEsque,
  ResponseEsque,
} from '../../internals/types';
import {
  HTTPHeaders,
  Operation,
  PromiseAndCancel,
  TRPCClientRuntime,
} from '../types';

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
  headers?:
    | HTTPHeaders
    | ((opts: { ops: Operation[] }) => HTTPHeaders | Promise<HTTPHeaders>);
}

export interface ResolvedHTTPLinkOptions {
  url: string;
  fetch: FetchEsque;
  AbortController: AbortControllerEsque | null;
  /**
   * Headers to be set on outgoing request
   * @link http://trpc.io/docs/v10/header
   */
  headers: (opts: { ops: Operation[] }) => HTTPHeaders | Promise<HTTPHeaders>;
}

export function resolveHTTPLinkOptions(
  opts: HTTPLinkOptions,
): ResolvedHTTPLinkOptions {
  const headers = opts.headers || {};
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

export type HTTPRequestOptions = ResolvedHTTPLinkOptions &
  GetInputOptions & {
    type: ProcedureType;
    ops: Operation[]; // TODO: if we do this, then we should get rid of type and path
  };

export function getUrl(opts: HTTPRequestOptions) {
  const path = opts.ops.map((op) => op.path).join(',');
  let url = opts.url + '/' + path;
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
}

type GetBodyOptions = { type: ProcedureType } & GetInputOptions;

export function getBody(opts: GetBodyOptions) {
  if (opts.type === 'query') {
    return undefined;
  }
  const input = getInput(opts);
  return input !== undefined ? JSON.stringify(input) : undefined;
}

export function httpRequest(
  opts: HTTPRequestOptions,
): PromiseAndCancel<HTTPResult> {
  const { type, ops } = opts;
  const ac = opts.AbortController ? new opts.AbortController() : null;

  const promise = new Promise<HTTPResult>((resolve, reject) => {
    const url = getUrl(opts);
    const body = getBody(opts);

    const meta = {} as HTTPResult['meta'];
    Promise.resolve(opts.headers({ ops }))
      .then((headers) => {
        /* istanbul ignore if -- @preserve */
        if (type === 'subscription') {
          throw new Error('Subscriptions should use wsLink');
        }
        return opts.fetch(url, {
          method: METHOD[type],
          signal: ac?.signal,
          body: body,
          headers: {
            'content-type': 'application/json',
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
