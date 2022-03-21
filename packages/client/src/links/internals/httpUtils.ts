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
export function httpRequest(
  props: {
    runtime: TRPCClientRuntime;
    type: ProcedureType;
    path: string;
    url: string;
  } & ({ inputs: unknown[] } | { input: unknown }),
): PromiseAndCancel<ResponseShape> {
  const { type, runtime: rt, path } = props;
  const ac = rt.AbortController ? new rt.AbortController() : null;

  const input = 'input' in props ? props.input : arrayToDict(props.inputs);

  function getUrl() {
    let url = props.url + '/' + path;
    const queryParts: string[] = [];
    if ('inputs' in props) {
      queryParts.push('batch=1');
    }
    if (type === 'query' && input !== undefined) {
      queryParts.push(`input=${encodeURIComponent(JSON.stringify(input))}`);
    }
    if (queryParts.length) {
      url += '?' + queryParts.join('&');
    }
    return url;
  }
  function getBody() {
    if (type === 'query') {
      return undefined;
    }
    return input !== undefined ? JSON.stringify(input) : undefined;
  }

  const promise = new Promise<ResponseShape>((resolve, reject) => {
    const url = getUrl();

    const meta = {} as any as ResponseShape['meta'];
    Promise.resolve(rt.headers())
      .then((headers) =>
        rt.fetch(url, {
          method: METHOD[type],
          signal: ac?.signal,
          body: getBody(),
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
