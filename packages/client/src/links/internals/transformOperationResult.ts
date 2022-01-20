import { AnyRouter } from '@trpc/server';
import { TRPCClientError } from '../../TRPCClientError';
import { OperationResult } from '../types';

/** @internal */
export function transformOperationResult<TRouter extends AnyRouter, TOutput>(
  result: OperationResult<TRouter, TOutput>,
) {
  const { context } = result;

  if ('error' in result.data) {
    const error = TRPCClientError.from<TRouter>(result.data);
    return {
      ok: false,
      error,
      context,
    } as const;
  }
  const data = (result.data.result as any).data as TOutput;
  return {
    ok: true,
    data,
    context,
  } as const;
}
