import type {
  CreateTRPCClientOptions,
  TRPCLink,
  TRPCRequestOptions,
} from '@trpc/client';
import { createTRPCUntypedClient, TRPCClientError } from '@trpc/client';
import type {
  CoercedTransformerParameters,
  TransformerOptions,
} from '@trpc/client/unstable-internals';
import { getTransformer } from '@trpc/client/unstable-internals';
import { observable } from '@trpc/server/observable';
import type {
  inferClientTypes,
  InferrableClientTypes,
  MaybePromise,
  ProcedureOptions,
  Simplify,
  TypeError,
} from '@trpc/server/unstable-core-do-not-import';
import { transformResult } from '@trpc/server/unstable-core-do-not-import';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TRPCActionHandler } from './server';
import type { ActionHandlerDef } from './shared';
import { isFormData } from './shared';

type MutationArgs<TDef extends ActionHandlerDef> = TDef['input'] extends void
  ? [input?: undefined | void, opts?: ProcedureOptions]
  : [input: FormData | TDef['input'], opts?: ProcedureOptions];

interface UseTRPCActionBaseResult<TDef extends ActionHandlerDef> {
  mutate: (...args: MutationArgs<TDef>) => void;
  mutateAsync: (...args: MutationArgs<TDef>) => Promise<TDef['output']>;
}

interface UseTRPCActionSuccessResult<TDef extends ActionHandlerDef>
  extends UseTRPCActionBaseResult<TDef> {
  data: TDef['output'];
  error?: never;
  status: 'success';
}

interface UseTRPCActionErrorResult<TDef extends ActionHandlerDef>
  extends UseTRPCActionBaseResult<TDef> {
  data?: never;
  error: TRPCClientError<TDef['errorShape']>;
  status: 'error';
}

interface UseTRPCActionIdleResult<TDef extends ActionHandlerDef>
  extends UseTRPCActionBaseResult<TDef> {
  data?: never;
  error?: never;
  status: 'idle';
}

interface UseTRPCActionLoadingResult<TDef extends ActionHandlerDef>
  extends UseTRPCActionBaseResult<TDef> {
  data?: never;
  error?: never;
  status: 'loading';
}

// ts-prune-ignore-next
export type UseTRPCActionResult<TDef extends ActionHandlerDef> =
  | UseTRPCActionErrorResult<TDef>
  | UseTRPCActionIdleResult<TDef>
  | UseTRPCActionLoadingResult<TDef>
  | UseTRPCActionSuccessResult<TDef>;

type ActionContext = {
  _action: (...args: any[]) => Promise<any>;
};

// ts-prune-ignore-next
export function experimental_serverActionLink<
  TInferrable extends InferrableClientTypes,
>(
  ...args: InferrableClientTypes extends TInferrable
    ? [
        TypeError<'Generic parameter missing in `experimental_createActionHook<HERE>()` or experimental_serverActionLink<HERE>()'>,
      ]
    : inferClientTypes<TInferrable>['transformer'] extends true
    ? [
        opts: TransformerOptions<{
          transformer: true;
        }>,
      ]
    : [
        opts?: TransformerOptions<{
          transformer: false;
        }>,
      ]
): TRPCLink<TInferrable> {
  const [opts] = args as [CoercedTransformerParameters];
  const transformer = getTransformer(opts?.transformer);
  return () =>
    ({ op }) =>
      observable((observer) => {
        const context = op.context as ActionContext;

        context
          ._action(
            isFormData(op.input)
              ? op.input
              : transformer.input.serialize(op.input),
          )
          .then((data) => {
            const transformed = transformResult(data, transformer.output);

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
          .catch((cause) => {
            observer.error(TRPCClientError.from(cause));
          });
      });
}

interface UseTRPCActionOptions<TDef extends ActionHandlerDef> {
  onSuccess?: (result: TDef['output']) => MaybePromise<void> | void;
  onError?: (result: TRPCClientError<TDef['errorShape']>) => MaybePromise<void>;
}
// ts-prune-ignore-next
export function experimental_createActionHook<
  TInferrable extends InferrableClientTypes,
>(
  opts: InferrableClientTypes extends TInferrable
    ? TypeError<'Generic parameter missing in `experimental_createActionHook<HERE>()`'>
    : CreateTRPCClientOptions<TInferrable>,
) {
  type ActionContext = {
    _action: (...args: any[]) => Promise<any>;
  };
  const client = createTRPCUntypedClient(
    opts as Exclude<typeof opts, TypeError<any>>,
  );
  return function useAction<TDef extends ActionHandlerDef>(
    handler: TRPCActionHandler<TDef>,
    useActionOpts?: UseTRPCActionOptions<Simplify<TDef>>,
  ) {
    const count = useRef(0);

    type Result = UseTRPCActionResult<TDef>;
    type State = Omit<Result, 'mutate' | 'mutateAsync'>;
    const [state, setState] = useState<State>({
      status: 'idle',
    });

    const actionOptsRef = useRef(useActionOpts);
    actionOptsRef.current = useActionOpts;

    useEffect(() => {
      return () => {
        // cleanup after unmount to prevent calling hook opts after unmount
        count.current = -1;
        actionOptsRef.current = undefined;
      };
    }, []);

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
          .then(async (data) => {
            await actionOptsRef.current?.onSuccess?.(data as any);
            if (idx !== count.current) {
              return;
            }
            setState({
              status: 'success',
              data: data as any,
            });
          })
          .catch(async (error) => {
            await actionOptsRef.current?.onError?.(error);
            throw error;
          })
          .catch((error) => {
            if (idx !== count.current) {
              return;
            }
            setState({
              status: 'error',
              error: TRPCClientError.from(error, {}),
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
