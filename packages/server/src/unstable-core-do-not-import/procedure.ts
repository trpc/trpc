import type { TRPCError } from './error/TRPCError';
import type { Parser } from './parser';
import type { ProcedureCallOptions } from './procedureBuilder';

export const procedureTypes = ['query', 'mutation', 'subscription'] as const;
/**
 * @public
 */
export type ProcedureType = (typeof procedureTypes)[number];

interface BuiltProcedureDef {
  meta: unknown;
  input: unknown;
  output: unknown;
}

/**
 *
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

export interface QueryProcedure<TDef extends BuiltProcedureDef>
  extends Procedure<'query', TDef> {}

export interface MutationProcedure<TDef extends BuiltProcedureDef>
  extends Procedure<'mutation', TDef> {}

export interface SubscriptionProcedure<TDef extends BuiltProcedureDef>
  extends Procedure<'subscription', TDef> {}

/**
 * @deprecated
 */
export interface LegacyObservableSubscriptionProcedure<
  TDef extends BuiltProcedureDef,
> extends SubscriptionProcedure<TDef> {
  _observable: true;
}

export type AnyQueryProcedure = QueryProcedure<any>;
export type AnyMutationProcedure = MutationProcedure<any>;
export type AnySubscriptionProcedure =
  | SubscriptionProcedure<any>
  | LegacyObservableSubscriptionProcedure<any>;

export type AnyProcedure =
  | AnyQueryProcedure
  | AnyMutationProcedure
  | AnySubscriptionProcedure;

export type inferProcedureInput<TProcedure extends AnyProcedure> =
  undefined extends inferProcedureParams<TProcedure>['$types']['input']
    ? void | inferProcedureParams<TProcedure>['$types']['input']
    : inferProcedureParams<TProcedure>['$types']['input'];

export type inferProcedureParams<TProcedure> = TProcedure extends AnyProcedure
  ? TProcedure['_def']
  : never;
export type inferProcedureOutput<TProcedure> =
  inferProcedureParams<TProcedure>['$types']['output'];

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
