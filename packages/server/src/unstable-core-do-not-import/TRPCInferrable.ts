import type { AnyRootConfig } from './rootConfig';
import type { AnyRouter } from './router';

export type TRPCInferrable = AnyRouter | AnyRootConfig;
export type inferConfigTypes<TInferrable extends TRPCInferrable> =
  TInferrable extends AnyRouter
    ? TInferrable['_def']['_config']['$types']
    : TInferrable extends AnyRootConfig
    ? TInferrable['$types']
    : never;

export type inferErrorShape<TInferrable extends TRPCInferrable> =
  inferConfigTypes<TInferrable>['errorShape'];
