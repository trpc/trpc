import { AnyRouter } from '@trpc/server';
import { TRPCClientError } from '../../TRPCClientError';
import { OperationResult } from '../types';

/** @internal */
export function transformOperationResult<TRouter extends AnyRouter, TOutput>(
  result: OperationResult<TRouter, TOutput>,
) {
  const { meta } = result;

  if ('error' in result.data) {
    const error = TRPCClientError.from<TRouter>(result.data);
    return {
      ok: false,
      error,
      meta,
    } as const;
  }
  const data = (result.data.result as any).data as TOutput;
  return {
    ok: true,
    data,
    meta,
  } as const;
}
