import type {
  HTTPErrorResponseEnvelope,
  HTTPResponseEnvelope,
  HTTPSuccessResponseEnvelope,
} from '../server/http';
import type {
  AnyRouter,
  inferAsyncReturnType,
  inferEndpointArgs,
  inferHandler,
} from '../server/router';
import type { inferSubscriptionData } from '../server/subscription';
import type { Maybe } from '../server/types';

type UnsubscribeFn = () => void;

type inferSubscriptionFn<TRouter extends AnyRouter> = <
  TPath extends keyof TRouter['_def']['subscriptions'],
  TArgs extends inferEndpointArgs<TRouter['_def']['subscriptions'][TPath]>,
  TData extends inferSubscriptionData<
    inferAsyncReturnType<TRouter['_def']['subscriptions'][TPath]>
  >
>(
  pathAndArgs: [TPath, ...TArgs],
  opts: {
    onSuccess?: (data: TData) => void;
    onError?: (envelope: HTTPErrorResponseEnvelope) => void;
    getNextArgs?: (data: TData) => TArgs;
  },
) => UnsubscribeFn;

export type HTTPSdk<TRouter extends AnyRouter> = {
  query: inferHandler<TRouter['_def']['queries']>;
  mutate: inferHandler<TRouter['_def']['mutations']>;
  subscription: inferSubscriptionFn<TRouter>;
};
export class HTTPClientError extends Error {
  public readonly json?: Maybe<HTTPResponseEnvelope<unknown>>;
  public readonly res?: Maybe<Response>;
  public readonly originalError?: Maybe<Error>;

  constructor(
    message: string,
    {
      res,
      json,
      originalError,
    }: {
      res?: Maybe<Response>;
      json?: Maybe<HTTPResponseEnvelope<unknown>>;
      originalError?: Maybe<Error>;
    },
  ) {
    super(message);
    this.message = message;
    this.res = res;
    this.json = json;
    this.originalError = originalError;

    Object.setPrototypeOf(this, HTTPClientError.prototype);
  }
}

export interface CreateHttpClientOptions {
  url: string;
  fetch?: typeof fetch;
  getHeaders?: () => Record<string, string | undefined>;
  onSuccess?: (data: HTTPSuccessResponseEnvelope<unknown>) => void;
  onError?: (error: HTTPClientError) => void;
}
export function createHttpClient<TRouter extends AnyRouter>(
  opts: CreateHttpClientOptions,
): HTTPSdk<TRouter> {
  const { fetch: _fetch = fetch, url } = opts;

  async function handleResponse(promise: Promise<Response>) {
    let res: Maybe<Response> = null;
    let json: Maybe<HTTPResponseEnvelope<unknown>> = null;
    try {
      res = await promise;
      json = (await res.json()) as HTTPResponseEnvelope<unknown>;

      if (json.ok === true) {
        opts.onSuccess && opts.onSuccess(json!);
        return json!.data as any;
      }
      throw new HTTPClientError(json.error.message, { json, res });
    } catch (originalError) {
      let err: HTTPClientError = originalError;
      if (!(err instanceof HTTPClientError)) {
        err = new HTTPClientError(originalError.message, {
          originalError,
          res,
          json,
        });
      }
      opts.onError && opts.onError(err);
      throw err;
    }
  }
  function getHeaders() {
    return {
      ...(opts.getHeaders ? opts.getHeaders() : {}),
      'content-type': 'application/json',
    };
  }
  const query: inferHandler<TRouter['_def']['queries']> = async (
    path: string,
    ...args: unknown[]
  ) => {
    let target = `${url}/${path}`;
    if (args?.length) {
      target += `?args=${encodeURIComponent(JSON.stringify(args as any))}`;
    }
    const promise = _fetch(target, {
      headers: getHeaders(),
    });

    return handleResponse(promise);
  };
  const mutate: inferHandler<TRouter['_def']['mutations']> = async (
    path,
    ...args
  ) => {
    const promise = _fetch(`${url}/${path}`, {
      method: 'post',
      body: JSON.stringify({
        args,
      }),
      headers: getHeaders(),
    });

    return handleResponse(promise);
  };
  const subscription: inferSubscriptionFn<TRouter> = (
    [path, ...args],
    opts,
  ) => {
    let stopped = false;
    const exec = async (...thisArgs: typeof args) => {
      const promise = _fetch(`${url}/${path}`, {
        method: 'patch',
        body: JSON.stringify({
          args: thisArgs,
        }),
        headers: getHeaders(),
      });
      try {
        console.log('⏲️ waiting for', path);
        const data = await handleResponse(promise);
        if (stopped) {
          return;
        }
        opts.onSuccess && opts.onSuccess(data);
        const nextArgs = opts.getNextArgs ? opts.getNextArgs(data) : thisArgs;
        console.log('nextArgs', nextArgs);

        exec(...nextArgs);
      } catch (err) {
        console.log('❌ subscription failed :(', err);
      }
    };
    exec(...args);
    return () => {
      stopped = true;
    };
  };
  return {
    mutate,
    query,
    subscription,
  };
}
