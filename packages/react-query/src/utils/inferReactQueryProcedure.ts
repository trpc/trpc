import { TRPCClientErrorLike } from '@trpc/client';
import {
  AnyMutationProcedure,
  AnyProcedure,
  AnyQueryProcedure,
  AnyRouter,
  inferProcedureInput,
} from '@trpc/server';
import { inferTransformedProcedureOutput } from '@trpc/server/dist/shared';
import { UseTRPCMutationOptions, UseTRPCQueryOptions } from '../shared';

type InferQueryOptions<
  TProcedure extends AnyProcedure,
  TPath extends string,
> = Omit<
  UseTRPCQueryOptions<
    TPath,
    inferProcedureInput<TProcedure>,
    inferTransformedProcedureOutput<TProcedure>,
    inferTransformedProcedureOutput<TProcedure>,
    TRPCClientErrorLike<TProcedure>
  >,
  'select'
>;

type InferMutationOptions<TProcedure extends AnyProcedure> =
  UseTRPCMutationOptions<
    inferProcedureInput<TProcedure>,
    TRPCClientErrorLike<TProcedure>,
    inferTransformedProcedureOutput<TProcedure>
  >;

type inferReactQueryProcedureOptions<
  TRouter extends AnyRouter,
  TPath extends string = '',
> = {
  [TKey in keyof TRouter['_def']['record']]: TRouter['_def']['record'][TKey] extends infer TRouterOrProcedure
    ? TRouterOrProcedure extends AnyRouter
      ? inferReactQueryProcedureOptions<
          TRouterOrProcedure,
          `${TPath}${TKey & string}.`
        >
      : TRouterOrProcedure extends AnyProcedure
      ? TRouterOrProcedure extends AnyMutationProcedure
        ? InferMutationOptions<TRouterOrProcedure>
        : TRouterOrProcedure extends AnyQueryProcedure
        ? InferQueryOptions<TRouterOrProcedure, `${TPath}${TKey & string}`>
        : never
      : never
    : never;
};

export type { inferReactQueryProcedureOptions };
