import { ProcedureType } from '@trpc/server';
import { PromiseAndCancel, TRPCClientRuntime } from '../types';

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

const METHOD = {
  query: 'GET',
  mutation: 'POST',
  subscription: 'PATCH',
} as const;

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
  const input = 'input' in opts ? opts.input : arrayToDict(opts.inputs);

  return opts.runtime.contentType.toString(input);
}

export type HTTPRequestOptions = HTTPLinkOptions &
  GetInputOptions & {
    type: ProcedureType;
    path: string;
  };

export function getUrl(opts: HTTPRequestOptions) {
  let url = opts.url + '/' + opts.path;
  const queryParts: string[] = [];
  if ('inputs' in opts) {
    queryParts.push('batch=1');
  }
  if (opts.type === 'query') {
    const input = getInput(opts);
    if (input !== undefined) {
      queryParts.push(`input=${encodeURIComponent(input)}`);
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
  return input;
}

export function httpRequest(
  opts: HTTPRequestOptions,
): PromiseAndCancel<ResponseShape> {
  const { type, runtime } = opts;
  const ac = runtime.AbortController ? new runtime.AbortController() : null;

  const promise = new Promise<ResponseShape>((resolve, reject) => {
    const url = getUrl(opts);
    const body = getBody(opts);

    const meta = {} as any as ResponseShape['meta'];
    Promise.resolve(runtime.headers())
      .then((headers) =>
        runtime.fetch(url, {
          method: METHOD[type],
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
