import { Context, HttpRequest } from '@azure/functions';
import { AnyRouter, inferRouterContext } from '@trpc/server';
import { resolveHTTPResponse } from '../../http';
// import { resolveHTTPResponse } from "@trpc/server/http";
import {
  AzureFunctionOptions,
  funcTriggerToHTTPRequest,
  tRPCOutputToAzureFuncOutput,
  urlToPath,
} from './utils';

export function azureFuncRequestHandler<TRouter extends AnyRouter>(
  opts: AzureFunctionOptions<TRouter>,
) {
  return async (context: Context, azureReq: HttpRequest) => {
    const req = funcTriggerToHTTPRequest(azureReq);
    const path = urlToPath(azureReq.url);

    const createContext = async function _createContext(): Promise<
      inferRouterContext<TRouter>
    > {
      return await opts.createContext?.({ req: azureReq, context });
    };

    const response = await resolveHTTPResponse({
      router: opts.router,
      batching: opts.batching,
      responseMeta: opts?.responseMeta,
      createContext,
      req,
      path,
      error: null,
      onError(o) {
        opts?.onError?.({
          ...o,
          req: azureReq,
        });
      },
    });

    context.res = tRPCOutputToAzureFuncOutput(response);
  };
}
