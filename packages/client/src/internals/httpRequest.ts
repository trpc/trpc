import { TRPCResponse } from '@trpc/server/rpc';
import {
  LinkRuntimeOptions,
  OperationMethod,
  PromiseAndCancel,
} from '../links/core';

// https://github.com/trpc/trpc/pull/669
function arrayToDict(array: unknown[]) {
  const dict: Record<number, unknown> = {};
  for (let index = 0; index < array.length; index++) {
    const element = array[index];
    dict[index] = element;
  }
  return dict;
}

export const httpMethods = {
  query: 'GET',
  mutation: 'POST',
} as const;

export const HTTP_SUBSCRIPTION_UNSUPPORTED_ERROR_MESSAGE =
  'Subscriptions are not supported over HTTP, please add a wsLink';
export const HTTP_UNDEFINED_METHOD_ERROR_MESSAGE =
  'Operations processed by httpLinks must define a method property';

export function httpRequest<TResponseShape = TRPCResponse>(
  props: {
    runtime: LinkRuntimeOptions;
    type: 'query' | 'mutation';
    method: OperationMethod;
    path: string;
    url: string;
  } & ({ inputs: unknown[] } | { input: unknown }),
): PromiseAndCancel<TResponseShape> {
  const { type, method, runtime: rt, path } = props;
  const ac = rt.AbortController ? new rt.AbortController() : null;
  const input =
    'input' in props
      ? rt.transformer.serialize(props.input)
      : arrayToDict(
          props.inputs.map((_input) => rt.transformer.serialize(_input)),
        );

  function getUrl() {
    let url = props.url + '/' + path;
    const queryParts: string[] = [];
    if (method !== httpMethods[type]) {
      queryParts.push(`type=${type}`);
    }
    if ('inputs' in props) {
      queryParts.push('batch=1');
    }
    if (method === 'GET' && input !== undefined) {
      queryParts.push(`input=${encodeURIComponent(JSON.stringify(input))}`);
    }
    if (queryParts.length) {
      url += '?' + queryParts.join('&');
    }
    return url;
  }
  function getBody() {
    if (method === 'POST' && input !== undefined) {
      return JSON.stringify(input);
    }
    return undefined;
  }

  const promise = new Promise<TResponseShape>((resolve, reject) => {
    const url = getUrl();

    Promise.resolve(rt.headers())
      .then((rawHeaders) => {
        const headers: HeadersInit = { 'content-type': 'application/json' };
        for (const key in rawHeaders) {
          const header = rawHeaders[key];
          if (header !== undefined) {
            if (Array.isArray(header)) {
              headers[key] = header.join(',');
            } else {
              headers[key] = header;
            }
          }
        }

        return rt.fetch(url, {
          method,
          signal: ac?.signal,
          body: getBody(),
          headers,
        });
      })
      .then((res) => {
        return res.json();
      })
      .then((json) => {
        resolve(json);
      })
      .catch(reject);
  });
  const cancel = () => {
    ac?.abort();
  };
  return { promise, cancel };
}
