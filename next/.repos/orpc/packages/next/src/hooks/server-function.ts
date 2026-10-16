import type { AnyORPCErrorJSON, SafeResult } from '@orpc/client'
import type { Interceptor, PromiseWithError } from '@orpc/shared'
import type { ServerFunction, ServerFunctionError } from '../server-function'
import { createORPCErrorFromJson, safe } from '@orpc/client'
import { intercept, toArray } from '@orpc/shared'
import { useCallback, useMemo, useRef, useState, useTransition } from 'react'

export interface UserSeverFunctionOptions<TInput, TOutput, TError> {
  interceptors?: Interceptor<{ input: TInput }, PromiseWithError<TOutput, TError>>[]
}

export interface UseServerFunctionExecuteOptions<TInput, TOutput, TError> extends Pick<UserSeverFunctionOptions<TInput, TOutput, TError>, 'interceptors'> {
}

export type UseServerFunctionExecuteRest<TInput, TOutput, TError>
  = undefined extends TInput
    ? [input?: TInput, options?: UseServerFunctionExecuteOptions<TInput, TOutput, TError>]
    : [input: TInput, options?: UseServerFunctionExecuteOptions<TInput, TOutput, TError>]

export interface UseServerFunctionResultBase<TInput, TOutput, TError> {
  reset: () => void
  execute: (...rest: UseServerFunctionExecuteRest<TInput, TOutput, TError>) => Promise<SafeResult<TOutput, TError>>
}

export interface UseServerFunctionIdleResult<TInput, TOutput, TError> extends UseServerFunctionResultBase<TInput, TOutput, TError> {
  input: undefined
  data: undefined
  error: null
  isIdle: true
  isPending: false
  isSuccess: false
  isError: false
  status: 'idle'
  executedAt: undefined
}

export interface UseServerFunctionPendingResult<TInput, TOutput, TError> extends UseServerFunctionResultBase<TInput, TOutput, TError> {
  input: TInput
  data: undefined
  error: null
  isIdle: false
  isPending: true
  isSuccess: false
  isError: false
  status: 'pending'
  executedAt: Date
}

export interface UseServerFunctionSuccessResult<TInput, TOutput, TError> extends UseServerFunctionResultBase<TInput, TOutput, TError> {
  input: TInput
  data: TOutput
  error: null
  isIdle: false
  isPending: false
  isSuccess: true
  isError: false
  status: 'success'
  executedAt: Date
}

export interface UseServerFunctionErrorResult<TInput, TOutput, TError> extends UseServerFunctionResultBase<TInput, TOutput, TError> {
  input: TInput
  data: undefined
  error: TError
  isIdle: false
  isPending: false
  isSuccess: false
  isError: true
  status: 'error'
  executedAt: Date
}

export type UseServerFunctionResult<TInput, TOutput, TError>
  = | UseServerFunctionIdleResult<TInput, TOutput, TError>
    | UseServerFunctionSuccessResult<TInput, TOutput, TError>
    | UseServerFunctionErrorResult<TInput, TOutput, TError>
    | UseServerFunctionPendingResult<TInput, TOutput, TError>

const INITIAL_STATE = {
  data: undefined,
  error: null,
  isIdle: true,
  isPending: false,
  isSuccess: false,
  isError: false,
  status: 'idle',
} as const

const PENDING_STATE = {
  data: undefined,
  error: null,
  isIdle: false,
  isPending: true,
  isSuccess: false,
  isError: false,
  status: 'pending',
}

/**
 * A React hook that executes a server function and tracks its status.
 *
 * @remarks
 * **Note**: Unlike direct server function calls, errors are deserialized into native
 * `ORPCError` instances instead of plain JSON (`ORPCErrorJSON`).
 *
 * @see {@link https://orpc.dev/docs/integrations/next#hooks | Next.js Integration - Hooks}
 */
export function useServerFunction<TInput, TOutput, TError extends AnyORPCErrorJSON>(
  fn: ServerFunction<TInput, TOutput, TError>,
  options: UserSeverFunctionOptions<TInput, TOutput, ServerFunctionError<TError>> = {},
): UseServerFunctionResult<TInput, TOutput, ServerFunctionError<TError>> {
  const [state, setState] = useState<Omit<
    | UseServerFunctionIdleResult<TInput, TOutput, ServerFunctionError<TError>>
    | UseServerFunctionSuccessResult<TInput, TOutput, ServerFunctionError<TError>>
    | UseServerFunctionErrorResult<TInput, TOutput, ServerFunctionError<TError>>,
    keyof UseServerFunctionResultBase<TInput, TOutput, ServerFunctionError<TError>> | 'executedAt' | 'input'
  >>(INITIAL_STATE)

  const executedAtRef = useRef<Date | undefined>(undefined)
  const [input, setInput] = useState<TInput | undefined>(undefined)
  const [isPending, startTransition] = useTransition()

  const reset = useCallback(() => {
    executedAtRef.current = undefined
    setInput(undefined)
    setState({ ...INITIAL_STATE })
  }, [])

  const execute = useCallback(async (input: TInput, executeOptions: UseServerFunctionExecuteOptions<TInput, TOutput, ServerFunctionError<TError>> = {}) => {
    const executedAt = new Date()
    executedAtRef.current = executedAt

    setInput(input)

    return new Promise((resolve) => {
      startTransition(async () => {
        const result = await safe(intercept(
          [...toArray(options.interceptors), ...toArray(executeOptions.interceptors)],
          { input: input as TInput },
          async ({ input }) => fn(input).then(([error, data]) => {
            if (error) {
              throw createORPCErrorFromJson(error)
            }

            return data as TOutput
          }),
        ))

        /**
         * If multiple execute calls are made in parallel, only the last one will be effective.
         */
        if (executedAtRef.current === executedAt) {
          setState({
            data: result.data,
            error: result.error as any,
            isIdle: false,
            isPending: false,
            isSuccess: !result.error,
            isError: !!result.error,
            status: !result.error ? 'success' : 'error',
          })
        }

        resolve(result)
      })
    })
  }, [fn, ...toArray(options.interceptors)])

  const result = useMemo(() => {
    const currentState = isPending && executedAtRef.current !== undefined
      ? PENDING_STATE
      : state

    return {
      ...currentState,
      executedAt: executedAtRef.current,
      input,
      reset,
      execute,
    }
  }, [isPending, state, input, reset, execute])

  return result as any
}
