import { HttpRequest as AzureHttpRequest, Context } from '@azure/functions';
import { AnyRouter, inferRouterContext } from '../../core';
import { TRPCError } from '../../error/TRPCError';
import {
  HTTPRequest,
  HTTPResponse,
  ResponseMetaFn,
} from '../../http/internals/types';
import { OnErrorFunction } from '../../internals/types';

export function funcTriggerToHTTPRequest(req: AzureHttpRequest): HTTPRequest {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (typeof value !== 'undefined') {
      query.append(key, value);
    }
  }

  return {
    method: req.method || 'get',
    query: query,
    headers: req.headers,
    body: req.bufferBody,
  };
}

export function urlToPath(url: string): string {
  const parsedUrl = new URL(url);
  const pathParts = parsedUrl.pathname.split('/');
  const trpcPath = pathParts[pathParts.length - 1];

  if (trpcPath === undefined) {
    // should not happen if the function is setup correctly.
    throw new TRPCError({
      code: 'BAD_REQUEST',
    });
  } else {
    return trpcPath;
  }
}

export type CreateAzureFuncContextOptions = {
  context: Context;
  req: AzureHttpRequest;
};

export type AzureFuncCreateContextFn<TRouter extends AnyRouter> = ({
  req,
  context,
}: CreateAzureFuncContextOptions) =>
  | inferRouterContext<TRouter>
  | Promise<inferRouterContext<TRouter>>;

export type AzureFunctionOptions<TRouter extends AnyRouter> = {
  router: TRouter;
  batching?: {
    enabled: boolean;
  };
  onError?: OnErrorFunction<TRouter, AzureHttpRequest>;
  responseMeta?: ResponseMetaFn<TRouter>;
  createContext?: AzureFuncCreateContextFn<TRouter>;
};

export function tRPCOutputToAzureFuncOutput(
  response: HTTPResponse,
): Record<string, any> {
  return {
    body: response.body ?? undefined,
    status: response.status,
    headers: {
      'Content-Type': 'application/json',
      ...(response.headers ?? {}),
    },
  };
}
