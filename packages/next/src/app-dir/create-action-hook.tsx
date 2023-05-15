import {
  CreateTRPCClientOptions,
  TRPCClientError,
  TRPCLink,
  TRPCRequestOptions,
  createTRPCUntypedClient,
} from '@trpc/client';
import { transformResult } from '@trpc/client/shared';
import {
  AnyProcedure,
  AnyRouter,
  DefaultDataTransformer,
  ProcedureOptions,
  inferHandlerInput,
} from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { Serialize } from '@trpc/server/shared';
import { useCallback, useMemo, useRef, useState } from 'react';
import { TRPCActionHandler } from './server';

type Def = {
  input?: any;
  output?: any;
  errorShape: any;
};

type MutationArgs<TDef extends Def> = TDef['input'] extends void
  ? [input?: undefined | void, opts?: ProcedureOptions]
  : [input: TDef['input'], opts?: ProcedureOptions];

interface UseTRPCActionBaseResult<TDef extends Def> {
  mutate: (...args: MutationArgs<TDef>) => void;
  mutateAsync: (...args: MutationArgs<TDef>) => Promise<Def['output']>;
}

interface UseTRPCActionSuccessResult<TDef extends Def>
  extends UseTRPCActionBaseResult<TDef> {
  data: TDef['output'];
  error?: never;
  status: 'success';
}

interface UseTRPCActionErrorResult<TDef extends Def>
  extends UseTRPCActionBaseResult<TDef> {
  data?: never;
  error: TDef['errorShape'];
  status: 'error';
}

interface UseTRPCActionIdleResult<TDef extends Def>
  extends UseTRPCActionBaseResult<TDef> {
  data?: never;
  error?: never;
  status: 'idle';
}

interface UseTRPCActionLoadingResult<TDef extends Def>
  extends UseTRPCActionBaseResult<TDef> {
  data?: never;
  error?: never;
  status: 'loading';
}

export type UseTRPCActionResult<TDef extends Def> =
  | UseTRPCActionSuccessResult<TDef>
  | UseTRPCActionErrorResult<TDef>
  | UseTRPCActionIdleResult<TDef>
  | UseTRPCActionLoadingResult<TDef>;

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

    type ProcDef = TProc['_def'];
    type Result = UseTRPCActionResult<{
      input: inferHandlerInput<TProc>[0];
      output: ProcDef['transformer'] extends DefaultDataTransformer
        ? Serialize<ProcDef['_output_in']>
        : ProcDef['_output_in'];
      errorShape: ProcDef['_config']['$types']['errorShape'];
    }>;
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
        void (mutateAsync as any)(...args).catch(() => {
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
    ) as Result;
  };
}
