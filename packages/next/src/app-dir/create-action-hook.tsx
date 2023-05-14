import {
  CreateTRPCClientOptions,
  TRPCClientError,
  TRPCLink,
  TRPCRequestOptions,
  createTRPCUntypedClient,
} from '@trpc/client';
import { transformResult } from '@trpc/client/shared';
import { AnyProcedure, AnyRouter, ProcedureArgs } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { inferTransformedProcedureOutput } from '@trpc/server/shared';
import { useCallback, useMemo, useRef, useState } from 'react';
import { TRPCActionHandler } from './server';

interface UseTRPCActionBaseResult<TProc extends AnyProcedure> {
  mutate: (...args: ProcedureArgs<TProc['_def']>) => void;
  mutateAsync: (
    ...args: ProcedureArgs<TProc['_def']>
  ) => Promise<inferTransformedProcedureOutput<TProc>>;
}

interface UseTRPCActionSuccessResult<TProc extends AnyProcedure>
  extends UseTRPCActionBaseResult<TProc> {
  data: inferTransformedProcedureOutput<TProc>;
  error?: never;
  status: 'success';
}

interface UseTRPCActionErrorResult<TProc extends AnyProcedure>
  extends UseTRPCActionBaseResult<TProc> {
  data?: never;
  error: TRPCClientError<TProc>;
  status: 'error';
}

interface UseTRPCActionIdleResult<TProc extends AnyProcedure>
  extends UseTRPCActionBaseResult<TProc> {
  data?: never;
  error?: never;
  status: 'idle';
}

interface UseTRPCActionLoadingResult<TProc extends AnyProcedure>
  extends UseTRPCActionBaseResult<TProc> {
  data?: never;
  error?: never;
  status: 'loading';
}

export type UseTRPCActionResult<TProc extends AnyProcedure> =
  | UseTRPCActionSuccessResult<TProc>
  | UseTRPCActionErrorResult<TProc>
  | UseTRPCActionIdleResult<TProc>
  | UseTRPCActionLoadingResult<TProc>;

type ActionContext = {
  _action: (...args: any[]) => Promise<any>;
};

export function experimental_serverActionLink<
  TRouter extends AnyRouter = AnyRouter,
>(): TRPCLink<TRouter> {
  return (runtime) =>
    ({ op }) =>
      observable((observer) => {
        const context = op.context as ActionContext;

        context
          ._action(op.input)
          .then((data) => {
            const transformed = transformResult(data, runtime);

            if (!transformed.ok) {
              observer.error(TRPCClientError.from(transformed.error, {}));
              return;
            }
            observer.next({
              context: op.context,
              result: transformed.result,
            });
            observer.complete();
          })
          .catch((cause) => observer.error(TRPCClientError.from(cause)));
      });
}

export function experimental_createActionHook<TRouter extends AnyRouter>(
  opts: CreateTRPCClientOptions<TRouter>,
) {
  // TODO decouple TRPCClient more?

  type ActionContext = {
    _action: (...args: any[]) => Promise<any>;
  };
  const client = createTRPCUntypedClient(opts);
  return function useAction<TProc extends AnyProcedure>(
    handler: TRPCActionHandler<TProc>,
  ) {
    const count = useRef(0);
    type Result = UseTRPCActionResult<TProc>;
    type State = Omit<Result, 'mutate' | 'mutateAsync'>;
    const [state, setState] = useState<State>({
      status: 'idle',
    });

    const mutateAsync = useCallback(
      (input: any, requestOptions?: TRPCRequestOptions) => {
        const idx = ++count.current;
        const context = {
          ...requestOptions?.context,
          _action(innerInput) {
            return handler(innerInput);
          },
        } as ActionContext;

        setState({
          status: 'loading',
        });
        return client
          .mutation('serverAction', input, {
            ...requestOptions,
            context,
          })
          .then((data) => {
            if (idx !== count.current) {
              return;
            }
            setState({
              status: 'success',
              data: data as any,
            });
          })
          .catch((error) => {
            if (idx !== count.current) {
              return;
            }
            setState({
              status: 'error',
              error,
            });
            throw error;
          });
      },
      [handler],
    ) as Result['mutateAsync'];

    const mutate: Result['mutate'] = useCallback(
      (...args: any[]) => {
        void mutateAsync(...(args as any)).catch(() => {
          // ignored
        });
      },
      [mutateAsync],
    );

    return useMemo(
      () => ({
        ...state,
        mutate,
        mutateAsync,
      }),
      [mutate, mutateAsync, state],
    ) as UseTRPCActionResult<TProc>;
  };
}
