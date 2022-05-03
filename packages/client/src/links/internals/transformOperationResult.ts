import { AnyRouter } from '@trpc/server';
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
