import { inferObservableValue } from '../observable';
import {
  AnyProcedure,
  Procedure,
  ProcedureArgs,
  ProcedureParams,
} from './procedure';
import { AnyRouter, ProcedureRouterRecord } from './router';

export type inferRouterDef<TRouter extends AnyRouter> = TRouter['_def'];
export type inferRouterContext<TRouter extends AnyRouter> =
  TRouter['_def']['_ctx'];
export type inferRouterError<TRouter extends AnyRouter> =
  TRouter['_def']['_errorShape'];

export type inferRouterMeta<TRouter extends AnyRouter> =
  TRouter['_def']['_meta'];

/** @internal */
export const $$itemKind = Symbol.for('trpc item kind');
/** @internal */
export enum ItemKind {
  Router,
  Procedure,
}
/** @internal */
export interface TRPCRouterItem<Kind> {
  [$$itemKind]: Kind;
}

export const procedureTypes = ['query', 'mutation', 'subscription'] as const;
/**
 * @public
 */
export type ProcedureType = typeof procedureTypes[number];

export type inferHandlerInput<TProcedure extends Procedure<any>> =
  ProcedureArgs<TProcedure['_def']>;

type RouterRecordValueShape<
  TRouterOrProcedure extends AnyRouter | AnyProcedure,
> = TRouterOrProcedure extends TRPCRouterItem<ItemKind.Router>
  ? RouterShape<TRouterOrProcedure['_def']['record']>
  : TRouterOrProcedure extends TRPCRouterItem<ItemKind.Procedure>
  ? {
      kind: TRouterOrProcedure['_procedureKind'];
      input: ProcedureArgs<TRouterOrProcedure['_def']>;
      output: TRouterOrProcedure['_def']['_output_out'];
    }
  : never;

export type ProcedureInputAndOutput<TProcedure extends AnyProcedure> =
  ProcedureParamsInputAndOutput<TProcedure['_def']>;

interface ProcedureParamsInputAndOutput<TParams extends ProcedureParams> {
  input: ProcedureArgs<TParams>;
  output: TParams['_output_out'];
  type: TParams['_config'];
}

export type inferRouterShape<TRouter extends AnyRouter> = {
  [TKey in keyof TRouter['_def']['record']]: RouterRecordValueShape<
    TRouter['_def']['record'][TKey]
  >;
};

type RouterShape<TRouterRecord extends ProcedureRouterRecord> = {
  [TKey in keyof TRouterRecord]: RouterRecordValueShape<TRouterRecord[TKey]>;
};

export type inferProcedureParams<TProcedure> = TProcedure extends Procedure<any>
  ? TProcedure['_def']
  : never;
export type inferProcedureOutput<TProcedure> =
  inferProcedureParams<TProcedure>['_output_out'];

export type inferSubscriptionOutput<
  TRouter extends AnyRouter,
  TPath extends keyof TRouter['_def']['subscriptions'] & string,
> = inferObservableValue<
  inferProcedureOutput<TRouter['_def']['subscriptions'][TPath]>
>;

export type inferProcedureClientError<T extends Procedure<any>> =
  inferProcedureParams<T>['_config']['errorShape'];
