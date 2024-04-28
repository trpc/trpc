/**
 * If you're making an adapter for tRPC and looking at this file for reference, you should import types and functions from `@trpc/server` and `@trpc/server/http`
 *
 * @example
 * ```ts
 * import type { AnyTRPCRouter } from '@trpc/server'
 * import type { HTTPBaseHandlerOptions } from '@trpc/server/http'
 * ```
 */
import type { Context as APIGWContext } from 'aws-lambda';
// @trpc/server
import type { AnyRouter } from '../../@trpc/server';
// @trpc/server
import type { ResolveHTTPRequestOptionsContextFn } from '../../@trpc/server/http';
import { resolveResponse } from '../../@trpc/server/http';
import type { AWSLambdaOptions, inferAPIGWReturn, LambdaEvent } from './utils';
import { getPlanner } from './utils';

export * from './utils';

export function awsLambdaRequestHandler<
  TRouter extends AnyRouter,
  TEvent extends LambdaEvent,
>(
  opts: AWSLambdaOptions<TRouter, TEvent>,
): (event: TEvent, context: APIGWContext) => Promise<inferAPIGWReturn<TEvent>> {
  return async (event, context) => {
    const planner = getPlanner(event);

    const createContext: ResolveHTTPRequestOptionsContextFn<TRouter> = async (
      innerOpts,
    ) => {
      return await opts.createContext?.({ event, context, ...innerOpts });
    };

    const response = await resolveResponse({
      ...opts,
      createContext,
      req: planner.request,
      path: planner.path,
      error: null,
      onError(o) {
        opts?.onError?.({
          ...o,
          req: event,
        });
      },
    });

    return await planner.toResult(response);
  };
}
