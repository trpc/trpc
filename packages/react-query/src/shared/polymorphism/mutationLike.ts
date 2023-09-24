import { AnyProcedure, AnyRootConfig, inferProcedureInput } from '@trpc/server';
import { inferTransformedProcedureOutput } from '@trpc/server/shared';
import { DecoratedMutation } from '../../createTRPCReact';

/**
 * Use to describe a mutation route which matches a given mutation procedure's interface
 */
export type MutationLike<
  TConfig extends AnyRootConfig = AnyRootConfig,
  TProcedure extends AnyProcedure = AnyProcedure,
> = DecoratedMutation<TConfig, TProcedure>;

/**
 * Use to unwrap a MutationLike's input
 */
export type InferMutationLikeInput<TMutationLike extends MutationLike> =
  TMutationLike extends MutationLike<any, infer $Procedure>
    ? inferProcedureInput<$Procedure>
    : never;

/**
 * Use to unwrap a MutationLike's data output
 */
export type InferMutationLikeData<TMutationLike extends MutationLike> =
  TMutationLike extends MutationLike<infer TConfig, infer TProcedure>
    ? inferTransformedProcedureOutput<TConfig, TProcedure>
    : never;
