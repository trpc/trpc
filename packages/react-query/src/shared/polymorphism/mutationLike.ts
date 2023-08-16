import { AnyProcedure, AnyRootConfig, inferProcedureInput } from '@trpc/server';
import { inferTransformedProcedureOutput } from '@trpc/server/shared';
import {
  InferMutationOptions,
  InferMutationResult,
} from '../../utils/inferReactQueryProcedure';

/**
 * Use to describe a mutation route which matches a given mutation procedure's interface
 */
export type MutationLike<
  TConfig extends AnyRootConfig = AnyRootConfig,
  TProcedure extends AnyProcedure = AnyProcedure,
> = {
  useMutation: (
    opts?: InferMutationOptions<TConfig, TProcedure>,
  ) => InferMutationResult<TConfig, TProcedure>;
};

/**
 * Use to unwrap a MutationLike's input
 */
export type InferMutationLikeInput<
  TConfig extends AnyRootConfig,
  TMutationLike extends MutationLike,
> = TMutationLike extends MutationLike<TConfig, infer $Procedure>
  ? inferProcedureInput<$Procedure>
  : never;

/**
 * Use to unwrap a MutationLike's data output
 */
export type InferMutationLikeData<
  TConfig extends AnyRootConfig,
  TMutationLike extends MutationLike,
> = TMutationLike extends MutationLike<TConfig, infer TProcedure>
  ? inferTransformedProcedureOutput<TConfig, TProcedure>
  : never;
