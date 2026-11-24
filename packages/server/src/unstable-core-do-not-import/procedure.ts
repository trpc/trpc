import type { TRPCError } from './error/TRPCError';
import type { Parser } from './parser';
import type { ProcedureCallOptions } from './procedureBuilder';
import type { inferAsyncIterableYield } from './types';

/** @internal */
export const procedureTypes = ['query', 'mutation', 'subscription'] as const;
/**
 * A procedure's kind: `'query'`, `'mutation'` or `'subscription'`.
 * @public
 */
export type ProcedureType = (typeof procedureTypes)[number];

interface BuiltProcedureDef {
  meta: unknown;
  input: unknown;
  output: unknown;
  errorShape?: unknown;
}

/**
 * A built procedure, as a router holds it.
 * @internal
 */
export interface Procedure<
  TType extends ProcedureType,
  TDef extends BuiltProcedureDef,
> {
  _def: {
    /**
     * These are just types, they can't be used at runtime
     * @internal
     */
    $types: {
      input: TDef['input'];
      output: TDef['output'];
      errorShape: TDef['errorShape'];
    };
    procedure: true;
    type: TType;
    /**
     * @internal
     * Meta is not inferrable on individual procedures, only on the router
     */
    meta: unknown;
    experimental_caller: boolean;
    /**
     * The input parsers for the procedure
     */
    inputs: Parser[];
  };
  meta: TDef['meta'];
  /**
   * @internal
   */
  (opts: ProcedureCallOptions<unknown>): Promise<TDef['output']>;
}

/**
 * A built query procedure.
 * @public
 */
export interface QueryProcedure<
  TDef extends BuiltProcedureDef,
> extends Procedure<'query', TDef> {}

/**
 * A built mutation procedure.
 * @public
 */
export interface MutationProcedure<
  TDef extends BuiltProcedureDef,
> extends Procedure<'mutation', TDef> {}

/**
 * A built subscription procedure.
 * @public
 */
export interface SubscriptionProcedure<
  TDef extends BuiltProcedureDef,
> extends Procedure<'subscription', TDef> {}

/**
 * A subscription procedure that returns an observable.
 * @deprecated Return an async generator from `.subscription()` instead.
 * @internal
 */
export interface LegacyObservableSubscriptionProcedure<
  TDef extends BuiltProcedureDef,
> extends SubscriptionProcedure<TDef> {
  _observable: true;
}

/**
 * Any query procedure, for use in generic constraints.
 * @public
 */
export type AnyQueryProcedure = QueryProcedure<any>;
/**
 * Any mutation procedure, for use in generic constraints.
 * @public
 */
export type AnyMutationProcedure = MutationProcedure<any>;
/**
 * Any subscription procedure, for use in generic constraints.
 * @public
 */
export type AnySubscriptionProcedure =
  | SubscriptionProcedure<any>
  | LegacyObservableSubscriptionProcedure<any>;

/**
 * Any procedure, for use in generic constraints.
 * @public
 */
export type AnyProcedure =
  | AnyQueryProcedure
  | AnyMutationProcedure
  | AnySubscriptionProcedure;

/**
 * The input type a procedure takes, before its validators run.
 * @see https://trpc.io/docs/client/vanilla/infer-types#inferring-individual-procedure-types
 * @public
 */
export type inferProcedureInput<TProcedure extends AnyProcedure> =
  undefined extends inferProcedureParams<TProcedure>['$types']['input']
    ? void | inferProcedureParams<TProcedure>['$types']['input']
    : inferProcedureParams<TProcedure>['$types']['input'];

/** @internal */
export type inferProcedureParams<TProcedure> = TProcedure extends AnyProcedure
  ? TProcedure['_def']
  : never;
/**
 * The output type a procedure returns, after its output validator runs.
 * @see https://trpc.io/docs/client/vanilla/infer-types#inferring-individual-procedure-types
 * @public
 */
export type inferProcedureOutput<TProcedure> =
  inferProcedureParams<TProcedure>['$types']['output'];

/**
 * The input type a subscription procedure takes.
 * @see https://trpc.io/docs/client/vanilla/infer-types#inferring-individual-procedure-types
 * @public
 */
export type inferSubscriptionInput<
  TProcedure extends AnySubscriptionProcedure,
> = inferProcedureInput<TProcedure>;

/**
 * The type of each event a subscription procedure emits.
 * @see https://trpc.io/docs/client/vanilla/infer-types#inferring-individual-procedure-types
 * @public
 */
export type inferSubscriptionOutput<
  TProcedure extends AnySubscriptionProcedure,
> =
  TProcedure extends LegacyObservableSubscriptionProcedure<any>
    ? inferProcedureOutput<TProcedure>
    : inferAsyncIterableYield<inferProcedureOutput<TProcedure>>;

/**
 * @internal
 */
export interface ErrorHandlerOptions<TContext> {
  error: TRPCError;
  type: ProcedureType | 'unknown';
  path: string | undefined;
  input: unknown;
  ctx: TContext | undefined;
}
