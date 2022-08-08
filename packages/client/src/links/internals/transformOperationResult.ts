import { AnyRouter } from '@trpc/server';
import { TRPCResultMessage } from '@trpc/server/rpc';
import { TRPCClientRuntime } from '..';
import { TRPCClientError } from '../../TRPCClientError';
import { OperationResultEnvelope } from '../types';

/** @internal */
export function transformOperationResult<TRouter extends AnyRouter, TOutput>(
  result: OperationResultEnvelope<TRouter, TOutput>,
  runtime: TRPCClientRuntime,
) {
  const { context } = result;

  if ('error' in result.result) {
    const error = TRPCClientError.from<TRouter>({
      ...result.result,
      error: runtime.transformer.deserialize(result.result.error),
    });
    return { ok: false, error, context } as const;
  }

  const data = runtime.transformer.deserialize(
    (result.result.result as any).data,
  ) as TOutput;
  return { ok: true, data, context } as const;
}

/** @internal */
export function transformSubscriptionOperationResult<
  TRouter extends AnyRouter,
  TOutput,
>(
  result: OperationResultEnvelope<TRouter, TOutput>,
  runtime: TRPCClientRuntime,
) {
  const { context } = result;

  if ('error' in result.result) {
    const error = TRPCClientError.from<TRouter>(
      {
        ...result.result,
        error: runtime.transformer.deserialize(result.result.error),
      },
      { meta: context },
    );
    return { ok: false, error, context } as const;
  }

  const data = {
    ...result.result.result,
    ...((result.result.result as any).type === 'data' && {
      data: runtime.transformer.deserialize((result.result.result as any).data),
    }),
  } as TRPCResultMessage<TOutput>;
  return { ok: true, data, context } as const;
}
