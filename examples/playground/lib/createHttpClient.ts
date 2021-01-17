import {
  HTTPErrorResponseEnvelope,
  HTTPResponseEnvelope,
  HTTPSuccessResponseEnvelope,
} from './http';
import { Router } from './router';

export type HTTPSdk<TRouter extends Router> = {
  get: ReturnType<TRouter['handler']>;
  post: ReturnType<TRouter['handler']>;
};

export class HTTPClientError extends Error {
  public readonly json?: HTTPErrorResponseEnvelope;
  public readonly res?: Response;
  public readonly originalError?: Error;

  constructor(
    message: string,
    {
      res,
      json,
      originalError,
    }: {
      res?: Response;
      json?: HTTPErrorResponseEnvelope;
      originalError?: Error;
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
  onError?: (error: Error) => void;
}
export function createHttpClient<TRouter extends Router>(
  opts: CreateHttpClientOptions,
): HTTPSdk<TRouter> {
  const { fetch: _fetch = fetch, url } = opts;

  async function handleResponse(promise: Promise<Response>) {
    let res: Response;
    try {
      res = await promise;
      const json: HTTPResponseEnvelope<unknown> = await res.json();

      if (json.ok === true) {
        opts.onSuccess && opts.onSuccess(json);
        return json.data as any;
      }
      throw new HTTPClientError(json.error.message, { json, res });
    } catch (originalError) {
      let err: HTTPClientError = originalError;
      if (!(err instanceof HTTPClientError)) {
        err = new HTTPClientError(originalError.message, { originalError });
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
  const get = async (path: string, ...args: unknown[]) => {
    let target = `${url}/${path}`;
    if (args?.length) {
      target += `?args=${encodeURIComponent(JSON.stringify(args as any))}`;
    }
    const promise = _fetch(target, {
      headers: getHeaders(),
    });

    return handleResponse(promise);
  };
  const post = async (path: string, ...args: unknown[]) => {
    const promise = _fetch(`${url}/${path}`, {
      method: 'post',
      body: JSON.stringify({
        args,
      }),
      headers: getHeaders(),
    });

    return handleResponse(promise);
  };
  return ({
    post,
    get,
  } as any) as HTTPSdk<TRouter>;
}
