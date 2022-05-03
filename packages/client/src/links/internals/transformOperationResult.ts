import { AnyRouter } from '@trpc/server';
import { TRPCResultMessage } from '@trpc/server/rpc';
import { TRPCClientRuntime } from '..';
import { TRPCClientError } from '../../TRPCClientError';
import { OperationResult } from '../types';

/** @internal */
export function transformOperationResult<TRouter extends AnyRouter, TOutput>(
  result: OperationResult<TRouter, TOutput>,
  runtime: TRPCClientRuntime,
) {
  const { context } = result;

  if ('error' in result.data) {
    const error = TRPCClientError.from<TRouter>({
      ...result.data,
      error: runtime.transformer.deserialize(result.data.error),
    });
    return { ok: false, error, context } as const;
  }

  const data = runtime.transformer.deserialize(
    (result.data.result as any).data,
  ) as TOutput;
  return { ok: true, data, context } as const;
}

/** @internal */
export function transformSubscriptionOperationResult<
  TRouter extends AnyRouter,
  TOutput,
>(result: OperationResult<TRouter, TOutput>, runtime: TRPCClientRuntime) {
  const { context } = result;

  if ('error' in result.data) {
    const error = TRPCClientError.from<TRouter>(
      {
        ...result.data,
        error: runtime.transformer.deserialize(result.data.error),
      },
      { meta: context },
    );
    return { ok: false, error, context } as const;
  }

  const data = {
    ...result.data.result,
    ...((result.data.result as any).type === 'data' && {
      data: runtime.transformer.deserialize((result.data.result as any).data),
    }),
  } as TRPCResultMessage<TOutput>;
  return { ok: true, data, context } as const;
}
