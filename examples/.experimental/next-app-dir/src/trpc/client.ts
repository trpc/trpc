'use client';

import {
  CreateTRPCClientOptions,
  TRPCClientError,
  TRPCRequestOptions,
  createTRPCUntypedClient,
  httpBatchLink,
  loggerLink,
} from '@trpc/client';
import { transformResult } from '@trpc/client/shared';
import { experimental_createTRPCNextAppDirClient } from '@trpc/next/app-dir/client';
import type {
  AnyTRPCActionHandler,
  TRPCActionHandler,
} from '@trpc/next/app-dir/server';
import {
  AnyProcedure,
  AnyRouter,
  ProcedureArgs,
  inferHandlerInput,
  inferProcedureOutput,
} from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { inferTransformedProcedureOutput } from '@trpc/server/shared';
import { useCallback, useMemo, useRef, useState } from 'react';
import { AppRouter } from '~/server/routers/_app';
import { getUrl } from './shared';

export const api = experimental_createTRPCNextAppDirClient<AppRouter>({
  config() {
    return {
      links: [
        loggerLink({
          enabled: (op) =>
            process.env.NODE_ENV === 'development' ||
            (op.direction === 'down' && op.result instanceof Error),
        }),
        httpBatchLink({
          url: getUrl(),
          headers() {
            return {
              'x-trpc-source': 'client',
            };
          },
        }),
      ],
    };
  },
});

interface UseTRPCActionBaseResult<TProc extends AnyProcedure> {
  mutate: (...args: ProcedureArgs<TProc['_def']>) => void;
  mutateAsync: (
    ...args: ProcedureArgs<TProc['_def']>
  ) => Promise<inferTransformedProcedureOutput<TProc>>;
}

interface UseTRPCActionSuccessResult<TProc extends AnyProcedure>
  extends UseTRPCActionBaseResult<TProc> {
  data: inferTransformedProcedureOutput<TProc>;
  error?: undefined;
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

export type UseTRPCActionResult<TProc extends AnyProcedure> =
  | UseTRPCActionSuccessResult<TProc>
  | UseTRPCActionErrorResult<TProc>
  | UseTRPCActionIdleResult<TProc>;

function createActionHook<TRouter extends AnyRouter>(
  opts: CreateTRPCClientOptions<TRouter>,
) {
  // TODO decouple TRPCClient more?

  type ActionContext = {
    _action: (...args: any[]) => Promise<any>;
  };
  const client = createTRPCUntypedClient({
    ...opts,
    links: [
      ...opts.links,
      //
      (runtime) =>
        ({ op }) =>
          observable((obs) => {
            const context = op.context as ActionContext;
            // transformResult
            context
              ._action(op.input)
              .then((data) => {
                obs.next({
                  result: {
                    data,
                  },
                });
              })
              .catch((err) => {});
          }),
    ],
  });
  return function action<TProc extends AnyProcedure>(
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
      [mutate, mutateAsync],
    ) as UseTRPCActionResult<TProc>;
  };
}

export const useAction = createActionHook({
  links: [
    loggerLink(),
    httpBatchLink({
      url: getUrl(),
    }),
  ],
});
