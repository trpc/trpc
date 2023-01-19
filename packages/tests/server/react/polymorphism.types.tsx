import { TRPCClientErrorLike } from '@trpc/client';
import {
  UseTRPCMutationOptions,
  UseTRPCMutationResult,
  UseTRPCQueryOptions,
  UseTRPCQueryResult,
} from '@trpc/react-query/shared';
import { AnyProcedure, inferProcedureInput } from '@trpc/server';
import { inferTransformedProcedureOutput } from '@trpc/server/shared';

//
// Types which could be included in the @trpc/react-query package to assist in polymorphic usage
//

export type MutationLike<TProcedure extends AnyProcedure> = {
  useMutation: (
    opts?: InferMutationOptions<TProcedure>,
  ) => InferMutationResult<TProcedure>;
};

export type QueryLike<TProcedure extends AnyProcedure> = {
  useQuery: (
    variables: inferProcedureInput<TProcedure>,
    opts?: InferQueryOptions<TProcedure, any>,
  ) => InferQueryResult<TProcedure>;
};

// TODO: it would be nice to also support Utils for this
export type UtilsLike = {
  invalidate: never;
};

//
// Some new Infer types in the form of the existing internal ones
//

type InferQueryResult<TProcedure extends AnyProcedure> = UseTRPCQueryResult<
  inferTransformedProcedureOutput<TProcedure>,
  TRPCClientErrorLike<TProcedure>
>;

type InferMutationResult<
  TProcedure extends AnyProcedure,
  TContext = unknown,
> = UseTRPCMutationResult<
  inferTransformedProcedureOutput<TProcedure>,
  TRPCClientErrorLike<TProcedure>,
  inferProcedureInput<TProcedure>,
  TContext
>;

//
// Ripped out of packages/react-query/src/utils/inferReactQueryProcedure.ts
//

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
