import { AnyRouter, DataTransformer, inferRouterError } from '@trpc/server';
import { TRPCResponse } from '@trpc/server/rpc';
import { TRPCClientError } from '..';
import { observable } from '../rx/observable';
import { Observable } from '../rx/types';

export type OperationMeta = Record<string, unknown>;
export type Operation<TInput = unknown> = {
  id: number;
  type: 'query' | 'mutation' | 'subscription';
  input: TInput;
  path: string;
  meta: OperationMeta;
};

export type HTTPHeaders = Record<string, string | string[] | undefined>;

/**
 * The default `fetch` implementation has an overloaded signature. By convention this library
 * only uses the overload taking a string and options object.
 */
export type TRPCFetch = (
  url: string,
  options?: RequestInit,
) => Promise<Response>;

export type LinkRuntimeOptions = Readonly<{
  /**
   * @deprecated to be moved to a link
   */
  transformer: DataTransformer;
  headers: () => HTTPHeaders | Promise<HTTPHeaders>;
  fetch: TRPCFetch;
  AbortController?: typeof AbortController;
}>;

export interface OperationResult<TRouter extends AnyRouter, TOutput> {
  data: TRPCResponse<TOutput, inferRouterError<TRouter>>;
  meta?: OperationMeta;
}

export type OperationResultObservable<
  TRouter extends AnyRouter,
  TOutput,
> = Observable<OperationResult<TRouter, TOutput>, TRPCClientError<TRouter>>;

export type OperationLink<
  TRouter extends AnyRouter,
  TInput = unknown,
  TOutput = unknown,
> = (opts: {
  op: Operation<TInput>;
  next: (op: Operation<TInput>) => OperationResultObservable<TRouter, TOutput>;
}) => OperationResultObservable<TRouter, TOutput>;

export type TRPCLink<TRouter extends AnyRouter> = (
  opts: LinkRuntimeOptions,
) => OperationLink<TRouter>;

export function createChain<
  TRouter extends AnyRouter,
  TInput = unknown,
  TOutput = unknown,
>(opts: {
  links: OperationLink<TRouter, TInput, TOutput>[];
  op: Operation<TInput>;
}): OperationResultObservable<TRouter, TOutput> {
  return observable((observer) => {
    function execute(index = 0, op = opts.op) {
      const observable$ = opts.links[index]({
        op,
        next(nextOp) {
          const observer = execute(index + 1, nextOp);

          return observer;
        },
      });
      return observable$;
    }

    const obs = execute();
    const subscription$ = obs.subscribe(observer);

    return () => {
      subscription$.unsubscribe();
    };
  });
}

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
