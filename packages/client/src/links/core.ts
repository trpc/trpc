import {
  DataTransformer,
  HTTPResponseEnvelope,
  ProcedureType,
} from '@trpc/server';
import { TRPCClientError } from '../createTRPCClient';
import { observable } from '../observable';

export type Operation<TInput = unknown> = {
  type: 'query' | 'mutation' | 'subscription';
  input: TInput;
  path: string;
};
type ResponseEnvelope = HTTPResponseEnvelope<any, any>;
type ErrorResult = TRPCClientError<any>;

type OperationResult = ResponseEnvelope | ErrorResult;

export type PrevCallback = (result: OperationResult) => void;
export type OperationLink = (opts: {
  op: Operation;
  prev: PrevCallback;
  next: (op: Operation, callback: PrevCallback) => void;
  onDestroy: (callback: () => void) => void;
}) => void;

export type TRPCLink = (opts: LinkRuntimeOptions) => OperationLink;

export type LinkRuntimeOptions = {
  transformer: DataTransformer;
  headers: () => Record<string, string | string[] | undefined>;
  fetch: typeof fetch;
  AbortController?: typeof AbortController;
};

export function createChain(links: OperationLink[]) {
  return {
    call(_op: Operation) {
      const $result = observable<OperationResult | null>(null);
      const $aborted = observable(false);

      function walk({
        index,
        op,
        stack,
      }: {
        index: number;
        op: Operation;
        stack: PrevCallback[];
      }) {
        const link = links[index];
        const prev: PrevCallback =
          index === 0 ? (value) => $result.set(value) : stack[index - 1];

        link({
          op,
          prev,
          next: (op, prevOp) => {
            const prevStack = stack.slice();
            prevStack[index] = prevOp;
            walk({ index: index + 1, op, stack: prevStack });
          },
          onDestroy: (callback) => {
            const unsub = $aborted.subscribe({
              onNext(aborted) {
                if (aborted) {
                  callback();
                  unsub();
                }
              },
            });
          },
        });
      }
      walk({ index: 0, op: _op, stack: [] });
      return {
        get: $result.get,
        subscribe: (callback: (value: OperationResult) => void) => {
          return $result.subscribe({
            onNext: (v) => {
              if (v) {
                callback(v);
              }
            },
          });
        },
        abort: () => {
          $aborted.set(true);
        },
      };
    },
  };
}

export interface HttpLinkOptions {
  url: string;
}
export type CancelFn = () => void;

export type PromiseAndCancel<TValue> = {
  promise: Promise<TValue>;
  cancel: CancelFn;
};

export function httpRequest<TResponseShape = unknown>(props: {
  runtime: LinkRuntimeOptions;
  type: ProcedureType;
  input: unknown;
  path: string;
  url: string;
  searchParams?: string;
}): PromiseAndCancel<any> {
  const { type, runtime: rt, input, path } = props;
  const ac = rt.AbortController ? new rt.AbortController() : null;
  const method = {
    query: 'GET',
    mutation: 'POST',
    subscription: 'PATCH',
  };
  function getUrl() {
    const urlParts = [props.url + '/' + path];
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
      urlParts.push(queryParts.join('&'));
    }
    return urlParts.join('?');
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
        resolve(rt.transformer.deserialize(json));
      })
      .catch(reject);
  });
  const cancel = () => {
    ac?.abort();
  };
  return { promise, cancel };
}
