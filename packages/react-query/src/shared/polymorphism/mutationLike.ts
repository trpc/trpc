import { AnyProcedure, AnyRouter, inferProcedureInput } from '@trpc/server';
import { inferTransformedProcedureOutput } from '@trpc/server/shared';
import {
  InferMutationOptions,
  InferMutationResult,
} from '../../utils/inferReactQueryProcedure';

/**
 * Use to describe a mutation route which matches a given mutation procedure's interface
 */
export type MutationLike<
  TRouter extends AnyRouter,
  TProcedure extends AnyProcedure = AnyProcedure,
> = {
  useMutation: (
    opts?: InferMutationOptions<TRouter, TProcedure>,
  ) => InferMutationResult<TRouter, TProcedure>;
};

/**
 * Use to unwrap a MutationLike's input
 */
export type InferMutationLikeInput<
  TRouter extends AnyRouter,
  TMutationLike extends MutationLike<TRouter>,
> = TMutationLike extends MutationLike<any, infer TProcedure>
  ? inferProcedureInput<TProcedure>
  : never;

/**
 * Use to unwrap a MutationLike's data output
 */
export type InferMutationLikeData<
  TRouter extends AnyRouter,
  TMutationLike extends MutationLike<TRouter>,
> = TMutationLike extends MutationLike<any, infer TProcedure>
  ? inferTransformedProcedureOutput<TRouter, TProcedure>
  : never;
