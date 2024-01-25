import type { AnyRootConfig } from './rootConfig';
import type { AnyRouter } from './router';

export type TRPCInferrable = AnyRouter | AnyRootConfig;
export type inferConfig<TInferrable extends TRPCInferrable> =
  TInferrable extends AnyRouter
    ? TInferrable['_def']['_config']['$types']
    : TInferrable extends AnyRootConfig
    ? TInferrable['$types']
    : never;

export type inferErrorShape<TInferrable extends TRPCInferrable> =
  inferConfig<TInferrable>['errorShape'];
