import { ProcedureParams, ProcedureType } from '..';
import { getParseFnOrPassThrough } from '../core/internals/getParseFn';
import {
  createInputMiddleware,
  createInternalBuilder,
  createOutputMiddleware,
} from '../core/internals/internalProcedure';
import { mergeWithoutOverrides } from '../core/internals/mergeWithoutOverrides';
import {
  MutationProcedure,
  Procedure as NewProcedure,
  QueryProcedure,
  SubscriptionProcedure,
} from '../core/procedure';
import {
  Router as NewRouter,
  RouterDef,
  createRouterFactory,
} from '../core/router';
import {
  AnyRouter as AnyOldRouter,
  Router as OldRouter,
} from '../deprecated/router';
import { TRPCErrorShape } from '../rpc';
import { Procedure as OldProcedure } from './internals/procedure';
import { ProcedureRecord } from './router';

type AnyOldProcedure = OldProcedure<any, any, any, any, any, any, any, any>;

type convertProcedureParams<TProcedure extends AnyOldProcedure> =
  TProcedure extends OldProcedure<
    infer TInputContext,
    infer TContext,
    infer TMeta,
    infer TInput,
    infer TParsedInput,
    infer TOutput,
    infer _TParsedOutput,
    infer TFinalInput
  >
    ? ProcedureParams<
        TInputContext,
        TContext,
        TInput,
        TParsedInput,
        TOutput,
        TFinalInput,
        TMeta
      >
    : never;

type MigrateProcedure<
  TProcedure extends AnyOldProcedure,
  TType extends ProcedureType,
> = TType extends 'query'
  ? QueryProcedure<convertProcedureParams<TProcedure>>
  : TType extends 'mutation'
  ? MutationProcedure<convertProcedureParams<TProcedure>>
  : TType extends 'subscription'
  ? SubscriptionProcedure<convertProcedureParams<TProcedure>>
  : never;

export type MigrateProcedureRecord<
  T extends ProcedureRecord<any>,
  TType extends ProcedureType,
> = {
  [K in keyof T]: MigrateProcedure<T[K], TType>;
};

export type MigrateRouter<
  TInputContext,
  TContext,
  TMeta extends Record<string, any>,
  TQueries extends ProcedureRecord<
    TInputContext,
    TContext,
    any,
    any,
    any,
    any,
    any
  >,
  TMutations extends ProcedureRecord<
    TInputContext,
    TContext,
    any,
    any,
    any,
    any,
    any
  >,
  TSubscriptions extends ProcedureRecord<
    TInputContext,
    TContext,
    unknown,
    unknown,
    any,
    unknown,
    unknown
  >,
  TErrorShape extends TRPCErrorShape<number>,
> = NewRouter<
  RouterDef<
    TInputContext,
    TErrorShape,
    TMeta,
    Record<string, never>,
    MigrateProcedureRecord<TQueries, 'query'> &
      MigrateProcedureRecord<TMutations, 'mutation'> &
      MigrateProcedureRecord<TSubscriptions, 'subscription'>
  >
>;

export type MigrateOldRouter<TRouter extends AnyOldRouter> =
  TRouter extends OldRouter<
    infer TInputContext,
    infer TContext,
    infer TMeta,
    infer TQueries,
    infer TMutations,
    infer TSubscriptions,
    infer TErrorShape
  >
    ? MigrateRouter<
        TInputContext,
        TContext,
        TMeta,
        TQueries,
        TMutations,
        TSubscriptions,
        TErrorShape
      >
    : never;

function migrateProcedure<
  TProcedure extends AnyOldProcedure,
  TType extends ProcedureType,
>(oldProc: TProcedure, type: TType): MigrateProcedure<TProcedure, TType> {
  const def = oldProc._def();

  const inputParser = getParseFnOrPassThrough(def.inputParser);
  const outputParser = getParseFnOrPassThrough(def.outputParser);

  const inputMiddleware = createInputMiddleware(inputParser);

  const builder = createInternalBuilder({
    input: def.inputParser,
    middlewares: [
      ...(def.middlewares as any),
      inputMiddleware,
      createOutputMiddleware(outputParser),
    ],
    meta: def.meta,
    output: def.outputParser,
    mutation: type === 'mutation',
    query: type === 'query',
    subscription: type === 'subscription',
  });

  const proc = builder[type]((opts) => def.resolver(opts as any));

  return proc as any;
}
export function migrateRouter<TOldRouter extends AnyOldRouter>(
  oldRouter: TOldRouter,
): MigrateOldRouter<TOldRouter> {
  const errorFormatter = oldRouter._def.errorFormatter;
  const transformer = oldRouter._def.transformer;

  type ProcRecord = Record<string, NewProcedure<any>>;

  const queries: ProcRecord = {};
  const mutations: ProcRecord = {};
  const subscriptions: ProcRecord = {};
  for (const [name, procedure] of Object.entries(oldRouter._def.queries)) {
    queries[name] = migrateProcedure(procedure as any, 'query');
  }

  for (const [name, procedure] of Object.entries(oldRouter._def.mutations)) {
    mutations[name] = migrateProcedure(procedure as any, 'mutation');
  }

  for (const [name, procedure] of Object.entries(
    oldRouter._def.subscriptions,
  )) {
    subscriptions[name] = migrateProcedure(procedure as any, 'subscription');
  }

  const procedures = mergeWithoutOverrides(queries, mutations, subscriptions);

  const newRouter = createRouterFactory<any>({
    transformer,
    errorFormatter,
  })({
    procedures,
  });

  return newRouter as any;
}
