import { AnyRouter, inferRouterError } from '@trpc/server';
import {
  TRPCResponse,
  TRPCResponseMessage,
  TRPCResultMessage,
} from '@trpc/server/rpc';
import { TRPCClientRuntime } from '..';

/** @internal */
export function transformResult<TRouter extends AnyRouter, TOutput>(
  response: TRPCResponse<TOutput, inferRouterError<TRouter>>,
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

  const data = runtime.transformer.deserialize(
    (response.result as any).data,
  ) as TOutput;
  return {
    ok: true,
    result: {
      ...response.result,
      type: 'data' as const,
      data,
    },
  } as const;
}

/** @internal */
export function transformSubscriptionResult<TRouter extends AnyRouter, TOutput>(
  message: TRPCResponseMessage<TOutput, inferRouterError<TRouter>>,
  runtime: TRPCClientRuntime,
) {
  if ('error' in message) {
    const error = runtime.transformer.deserialize(
      message.error,
    ) as inferRouterError<TRouter>;
    return { ok: false, error } as const;
  }

  const result = {
    ...message.result,
    ...(message.result.type === 'data' && {
      data: runtime.transformer.deserialize(message.result.data),
    }),
  } as TRPCResultMessage<TOutput>['result'];
  return { ok: true, result } as const;
}
