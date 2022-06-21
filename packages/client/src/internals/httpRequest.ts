import { DataTransformer, ProcedureType } from '@trpc/server';
import { TRPCResponse } from '@trpc/server/rpc';
import { HTTPHeaders, PromiseAndCancel, TRPCFetch } from '../links/core';

// https://github.com/trpc/trpc/pull/669
function arrayToDict(array: unknown[]) {
  const dict: Record<number, unknown> = {};
  for (let index = 0; index < array.length; index++) {
    const element = array[index];
    dict[index] = element;
  }
  return dict;
}

export function httpRequest<TResponseShape = TRPCResponse>(
  props: {
    transformer: DataTransformer;
    type: ProcedureType;
    path: string;
    url: string;
    AbortController?: typeof AbortController;
    fetch: TRPCFetch;
    headers: () => HTTPHeaders | Promise<HTTPHeaders>;
  } & ({ inputs: unknown[] } | { input: unknown }),
): PromiseAndCancel<TResponseShape> {
  const { type, transformer, path } = props;
  const ac = props.AbortController ? new props.AbortController() : null;
  const method = {
    query: 'GET',
    mutation: 'POST',
    subscription: 'PATCH',
  };
  const input =
    'input' in props
      ? transformer.serialize(props.input)
      : arrayToDict(
          props.inputs.map((_input) => transformer.serialize(_input)),
        );

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

  const promise = new Promise<TResponseShape>((resolve, reject) => {
    const url = getUrl();

    Promise.resolve(props.headers())
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

        return props.fetch(url, {
          method: method[type],
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
