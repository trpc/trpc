import { AnyRouter, inferRouterError } from '@trpc/server';
import {
  TRPCResponse,
  TRPCResponseMessage,
  TRPCResultMessage,
} from '@trpc/server/rpc';
import { TRPCClientRuntime } from '..';

/** @internal */
export function transformResult<TRouter extends AnyRouter, TOutput>(
  response:
    | TRPCResponseMessage<TOutput, inferRouterError<TRouter>>
    | TRPCResponse<TOutput, inferRouterError<TRouter>>,
  runtime: TRPCClientRuntime,
) {
  if ('error' in response) {
    const error = runtime.transformer.deserialize(
      response.error,
    ) as inferRouterError<TRouter>;
    return {
      ok: false,
      error: {
        ...response,
        error,
      },
    } as const;
  }

  const result = {
    ...response.result,
    ...((!response.result.type || response.result.type === 'data') && {
      type: 'data',
      data: runtime.transformer.deserialize(response.result.data),
    }),
  } as TRPCResultMessage<TOutput>['result'];
  return { ok: true, result } as const;
}
