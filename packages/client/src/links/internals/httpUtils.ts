import { OperationMethod, PromiseAndCancel, TRPCClientRuntime } from '../types';

export interface HTTPLinkOptions {
  url: string;
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

export const HTTP_METHODS = {
  query: 'GET',
  mutation: 'POST',
} as const;

export const HTTP_SUBSCRIPTION_UNSUPPORTED_ERROR_MESSAGE =
  'Subscriptions are not supported over HTTP, please add a wsLink';
export const HTTP_METHOD_UNDEFINED_ERROR_MESSAGE =
  'Operation processed by httpLinks must define a method property';

export interface ResponseShape {
  json: unknown;
  meta: {
    response: Response;
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

export type HTTPRequestOptions = HTTPLinkOptions &
  GetInputOptions & {
    type: 'query' | 'mutation';
    method: OperationMethod;
    path: string;
  };

export function getUrl(opts: HTTPRequestOptions) {
  const originalMethod = HTTP_METHODS[opts.type];
  let url = opts.url + '/' + opts.path;
  const queryParts: string[] = [];
  if (opts.method !== originalMethod) {
    queryParts.push(`type=${opts.type}`);
  }
  if ('inputs' in opts) {
    queryParts.push('batch=1');
  }
  if (opts.method === 'GET') {
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

export function getBody(opts: HTTPRequestOptions) {
  if (opts.method === 'POST') {
    const input = getInput(opts);
    if (input !== undefined) {
      return JSON.stringify(input);
    }
  }
  return undefined;
}

export function httpRequest(
  opts: HTTPRequestOptions,
): PromiseAndCancel<ResponseShape> {
  const { method, runtime } = opts;
  const ac = runtime.AbortController ? new runtime.AbortController() : null;

  const promise = new Promise<ResponseShape>((resolve, reject) => {
    const url = getUrl(opts);
    const body = getBody(opts);

    const meta = {} as any as ResponseShape['meta'];
    Promise.resolve(runtime.headers())
      .then((headers) =>
        runtime.fetch(url, {
          method,
          signal: ac?.signal,
          body: body,
          headers: {
            'content-type': 'application/json',
            ...headers,
          },
        }),
      )
      .then((_res) => {
        meta.response = _res;
        return _res.json();
      })
      .then((json) => {
        resolve({
          json,
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
