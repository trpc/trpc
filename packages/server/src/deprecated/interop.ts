import { ProcedureParams, ProcedureType } from '..';
import { AnyRootConfig, RootConfig } from '../core/internals/config';
import { getParseFnOrPassThrough } from '../core/internals/getParseFn';
import { mergeWithoutOverrides } from '../core/internals/mergeWithoutOverrides';
import { createBuilder } from '../core/internals/procedureBuilder';
import {
  createInputMiddleware,
  createOutputMiddleware,
} from '../core/middleware';
import { Procedure } from '../core/procedure';
import {
  ProcedureRecord as NewProcedureRecord,
  Router as NewRouter,
  RouterDef,
  createRouterFactory,
} from '../core/router';
import {
  AnyRouter as AnyOldRouter,
  Router as OldRouter,
} from '../deprecated/router';
import { TRPCErrorShape } from '../rpc';
import { CombinedDataTransformer } from '../transformer';
import { Procedure as OldProcedure } from './internals/procedure';
import { ProcedureRecord } from './router';

type AnyOldProcedure = OldProcedure<any, any, any, any, any, any, any, any>;

type convertProcedureParams<
  TConfig extends AnyRootConfig,
  TProcedure extends AnyOldProcedure,
> = TProcedure extends OldProcedure<
  infer _TInputContext,
  infer TContext,
  infer TMeta,
  infer TInput,
  infer TParsedInput,
  infer TOutput,
  infer _TParsedOutput,
  infer TFinalInput
>
  ? ProcedureParams<
      TConfig,
      TContext,
      TInput,
      TParsedInput,
      TOutput,
      TFinalInput,
      TMeta
    >
  : never;

type MigrateProcedure<
  TConfig extends AnyRootConfig,
  TProcedure extends AnyOldProcedure,
  TType extends ProcedureType,
> = Procedure<TType, convertProcedureParams<TConfig, TProcedure>>;

export type MigrateProcedureRecord<
  TConfig extends AnyRootConfig,
  TProcedureRecord extends ProcedureRecord<any>,
  TType extends ProcedureType,
> = {
  [K in keyof TProcedureRecord]: MigrateProcedure<
    TConfig,
    TProcedureRecord[K],
    TType
  >;
};

export type MigrateRouter<
  TInputContext extends Record<string, any>,
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
  TErrorShape extends TRPCErrorShape<any>,
  TTransformer extends CombinedDataTransformer,
> = NewRouter<
  RouterDef<
    RootConfig<{
      ctx: TInputContext;
      errorShape: TErrorShape;
      meta: TMeta;
      transformer: TTransformer;
    }>,
    {},
    {
      queries: MigrateProcedureRecord<
        RootConfig<{
          ctx: TInputContext;
          errorShape: TErrorShape;
          meta: TMeta;
          transformer: TTransformer;
        }>,
        TQueries,
        'query'
      >;
      mutations: MigrateProcedureRecord<
        RootConfig<{
          ctx: TInputContext;
          errorShape: TErrorShape;
          meta: TMeta;
          transformer: TTransformer;
        }>,
        TMutations,
        'mutation'
      >;
      subscriptions: MigrateProcedureRecord<
        RootConfig<{
          ctx: TInputContext;
          errorShape: TErrorShape;
          meta: TMeta;
          transformer: TTransformer;
        }>,
        TSubscriptions,
        'subscription'
      >;
    }
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
    infer TErrorShape,
    infer Transformer
  >
    ? MigrateRouter<
        TInputContext,
        TContext,
        TMeta,
        TQueries,
        TMutations,
        TSubscriptions,
        TErrorShape,
        Transformer
      >
    : never;

function migrateProcedure<
  TProcedure extends AnyOldProcedure,
  TType extends ProcedureType,
>(oldProc: TProcedure, type: TType): MigrateProcedure<any, TProcedure, TType> {
  const def = oldProc._def();

  const inputParser = getParseFnOrPassThrough(def.inputParser);
  const outputParser = getParseFnOrPassThrough(def.outputParser);

  const inputMiddleware = createInputMiddleware(inputParser);

  const builder = createBuilder({
    inputs: [def.inputParser],
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

  const queries: NewProcedureRecord = {};
  const mutations: NewProcedureRecord = {};
  const subscriptions: NewProcedureRecord = {};
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
    isDev: process.env.NODE_ENV !== 'production',
  })(procedures);

  return newRouter as any;
}
