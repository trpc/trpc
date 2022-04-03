import { ProcedureType } from '@trpc/server';
import { LinkRuntime, PromiseAndCancel } from '../types';

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
    runtime: LinkRuntime;
    type: ProcedureType;
    path: string;
    url: string;
  } & ({ inputs: unknown[] } | { input: unknown }),
): PromiseAndCancel<ResponseShape> {
  const { type, runtime: rt, path } = props;
  const ac = rt.AbortController ? new rt.AbortController() : null;

  const input = 'input' in props ? props.input : arrayToDict(props.inputs);

  function getUrl() {
    const url = new URL(props.url + '/' + path);

    if ('inputs' in props) {
      url.searchParams.set('batch', '1');
    }
    if (type === 'query' && input !== undefined) {
      url.searchParams.set('input', JSON.stringify(input));
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
        rt.fetch(url.href, {
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
