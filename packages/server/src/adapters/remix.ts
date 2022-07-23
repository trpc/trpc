import { AnyRouter } from '../core';
import { TRPCError } from '../error/TRPCError';
import {
  FetchCreateContextFnOptions,
  FetchHandlerRequestOptions,
  fetchRequestHandler,
} from './fetch';

export type RemixCreateContextFnOptions = FetchCreateContextFnOptions;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
    },
    status,
  });

/** LoaderArgs from Remix */
interface LoaderArgs {
  request: Request;
  params: Record<string, string | undefined>;
}

export function remixHTTPRequestHandler<TRouter extends AnyRouter>(
  opts: Omit<FetchHandlerRequestOptions<TRouter>, 'req' | 'endpoint' | 'path'>,
) {
  const handler = async (args: LoaderArgs) => {
    // if no hostname, set a dummy one
    function getPath(): string | null {
      if (typeof args.params.trpc === 'string') {
        return args.params.trpc;
      }
      return null;
    }
    const path = getPath();

    if (path === null) {
      const error = opts.router.getErrorShape({
        error: new TRPCError({
          message: 'Query "trpc" not found - is the file named `$trpc.ts`?',
          code: 'INTERNAL_SERVER_ERROR',
        }),
        type: 'unknown',
        ctx: undefined,
        path: undefined,
        input: undefined,
      });

      return json({ error }, 500);
    }

    return fetchRequestHandler({
      ...opts,
      path,
      endpoint: '',
      req: args.request,
    });
  };

  return { loader: handler, action: handler };
}
