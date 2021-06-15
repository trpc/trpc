import { ProcedureType } from '@trpc/server';
import { TRPCResponse } from '@trpc/server/rpc';
import { LinkRuntimeOptions, PromiseAndCancel } from '../links/core';

export function httpRequest<TResponseShape = TRPCResponse>(props: {
  runtime: LinkRuntimeOptions;
  type: ProcedureType;
  input: unknown;
  path: string;
  url: string;
  searchParams?: string;
}): PromiseAndCancel<TResponseShape> {
  const { type, runtime: rt, input, path } = props;
  const ac = rt.AbortController ? new rt.AbortController() : null;
  const method = {
    query: 'GET',
    mutation: 'POST',
    subscription: 'PATCH',
  };
  function getUrl() {
    let url = props.url + '/' + path;
    const queryParts: string[] = [];
    if (props.searchParams) {
      queryParts.push(props.searchParams);
    }
    if (type === 'query' && input != null) {
      queryParts.push(
        `input=${encodeURIComponent(
          JSON.stringify(rt.transformer.serialize(input)),
        )}`,
      );
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
    return JSON.stringify({
      input: rt.transformer.serialize(input),
    });
  }

  const promise = new Promise<TResponseShape>((resolve, reject) => {
    const url = getUrl();

    rt.fetch(url, {
      method: method[type],
      signal: ac?.signal,
      body: getBody(),
      headers: {
        'content-type': 'application/json',
        ...rt.headers(),
      },
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
