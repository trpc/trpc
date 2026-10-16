import type { AnyORPCErrorJSON } from '@orpc/client'
import type { ServerFunction, ServerFunctionError } from '../server-function'
import type { UserSeverFunctionOptions, UseServerFunctionResult } from './server-function'
import { onStart, toArray } from '@orpc/shared'
import { useCallback, useMemo, useOptimistic } from 'react'
import { useServerFunction } from './server-function'

export interface UseOptimisticServerFunctionOptions<TInput, TOutput, TError, TOptimisticState> extends
  UserSeverFunctionOptions<TInput, TOutput, TError> {
  optimisticPassthrough: TOptimisticState
  optimisticReducer: (state: TOptimisticState, input: TInput) => TOptimisticState
}

export type UseOptimisticServerFunctionResult<TInput, TOutput, TError, TOptimisticState> = UseServerFunctionResult<TInput, TOutput, TError> & {
  optimisticState: TOptimisticState
}

/**
 * Like `useServerFunction`, but additionally applies optimistic state updates
 * while the server function executes.
 *
 * @see {@link https://orpc.dev/docs/integrations/next#hooks | Next.js Integration - Hooks}
 */
export function useOptimisticServerFunction<TInput, TOutput, TError extends AnyORPCErrorJSON, TOptimisticState>(
  fn: ServerFunction<TInput, TOutput, TError>,
  options: UseOptimisticServerFunctionOptions<TInput, TOutput, ServerFunctionError<TError>, TOptimisticState>,
): UseOptimisticServerFunctionResult<TInput, TOutput, ServerFunctionError<TError>, TOptimisticState> {
  const [optimisticState, addOptimistic] = useOptimistic(options.optimisticPassthrough, options.optimisticReducer)

  const state = useServerFunction(fn, {
    ...options,
    interceptors: [
      useCallback(onStart(({ input }) => {
        addOptimistic(input)
      }), [addOptimistic]),
      ...toArray(options.interceptors),
    ],
  })

  return useMemo(() => ({ ...state, optimisticState }), [state, optimisticState]) as any
}
