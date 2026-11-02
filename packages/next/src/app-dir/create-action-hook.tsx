import type {
  CreateTRPCClientOptions,
  TRPCLink,
  TRPCProcedureOptions,
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
  Simplify,
  TypeError,
} from '@trpc/server/unstable-core-do-not-import';
import { transformResult } from '@trpc/server/unstable-core-do-not-import';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TRPCActionHandler } from './server';
import type { ActionHandlerDef } from './shared';
import { isFormData } from './shared';

type MutationArgs<TDef extends ActionHandlerDef> = TDef['input'] extends void
  ? [input?: undefined | void, opts?: TRPCProcedureOptions]
  : [input: FormData | TDef['input'], opts?: TRPCProcedureOptions];

type ActionError<TDef extends ActionHandlerDef> = TRPCClientError<{
  errorShape: TDef['errorShape'];
  transformer: boolean;
}>;

interface UseTRPCActionBaseResult<TDef extends ActionHandlerDef> {
  /**
   * Calls the action. It never throws: `onError` gets the error while the
   * component is mounted, and `error` is set if no newer call has started.
   */
  mutate: (...args: MutationArgs<TDef>) => void;
  /**
   * Like `mutate`, but returns a promise. It rejects on error, unless a
   * newer call has started or the component has unmounted.
   */
  mutateAsync: (...args: MutationArgs<TDef>) => Promise<TDef['output']>;
}

interface UseTRPCActionSuccessResult<
  TDef extends ActionHandlerDef,
> extends UseTRPCActionBaseResult<TDef> {
  data: TDef['output'];
  error?: never;
  status: 'success';
}

interface UseTRPCActionErrorResult<
  TDef extends ActionHandlerDef,
> extends UseTRPCActionBaseResult<TDef> {
  data?: never;
  error: ActionError<TDef>;
  status: 'error';
}

interface UseTRPCActionIdleResult<
  TDef extends ActionHandlerDef,
> extends UseTRPCActionBaseResult<TDef> {
  data?: never;
  error?: never;
  status: 'idle';
}

interface UseTRPCActionLoadingResult<
  TDef extends ActionHandlerDef,
> extends UseTRPCActionBaseResult<TDef> {
  data?: never;
  error?: never;
  status: 'loading';
}

/**
 * The result of a hook from {@link experimental_createActionHook}. Check
 * `status` to narrow it.
 */
// ts-prune-ignore-next
export type UseTRPCActionResult<TDef extends ActionHandlerDef> =
  | UseTRPCActionErrorResult<TDef>
  | UseTRPCActionIdleResult<TDef>
  | UseTRPCActionLoadingResult<TDef>
  | UseTRPCActionSuccessResult<TDef>;

type ActionContext = {
  _action: (...args: any[]) => Promise<any>;
};

/**
 * A terminating link that calls a server action.
 *
 * @see https://trpc.io/docs/client/nextjs/server-actions
 */
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
  onError?: (result: ActionError<TDef>) => MaybePromise<void>;
}
/**
 * Creates a React hook that calls a server action made with
 * `experimental_createServerActionHandler`.
 *
 * @see https://trpc.io/docs/client/nextjs/server-actions
 */
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
        const context: ActionContext = {
          ...requestOptions?.context,
          _action(innerInput) {
            return handler(innerInput);
          },
        };

        setState({
          status: 'loading',
        });
        return client
          .mutation('serverAction', input, {
            ...requestOptions,
            context,
          })
          .then(async (data) => {
            await actionOptsRef.current?.onSuccess?.(data);
            if (idx !== count.current) {
              return;
            }
            setState({
              status: 'success',
              data,
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
