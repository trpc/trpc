import { getParseFnOrPassThrough } from '../core/internals/getParseFn';
import {
  createInputMiddleware,
  createInternalBuilder,
  createOutputMiddleware,
} from '../core/internals/internalProcedure';
import { Procedure as NewProcedure } from '../core/procedure';
import { Router as NewRouter, createRouterWithContext } from '../core/router';
import {
  AnyRouter as AnyOldRouter,
  Router as OldRouter,
} from '../deprecated/router';
import { TRPCErrorShape } from '../rpc';
import { CombinedDataTransformer } from '../transformer';
import { Procedure as OldProcedure } from './internals/procedure';
import { ProcedureRecord } from './router';

type AnyOldProcedure = OldProcedure<any, any, any, any, any, any, any, any>;
type MigrateProcedure<TProcedure extends AnyOldProcedure> =
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
    ? NewProcedure<{
        _ctx_in: TInputContext;
        _ctx_out: TContext;
        _meta: TMeta;
        _input_in: TInput;
        _input_out: TParsedInput;
        _output_in: TOutput;
        _output_out: TFinalInput;
      }>
    : never;

export type MigrateProcedureRecord<T extends ProcedureRecord<any>> = {
  [K in keyof T]: MigrateProcedure<T[K]>;
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
> = NewRouter<{
  _ctx: TInputContext;
  _errorShape: TErrorShape;
  _meta: TMeta;
  errorFormatter: never;
  mutations: MigrateProcedureRecord<TMutations>;
  queries: MigrateProcedureRecord<TQueries>;
  subscriptions: MigrateProcedureRecord<TSubscriptions>;
  transformer: CombinedDataTransformer;
}>;

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

function migrateProcedure<TProcedure extends AnyOldProcedure>(
  oldProc: TProcedure,
): MigrateProcedure<TProcedure> {
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
  });

  const proc = builder.resolve((opts) => def.resolver(opts as any));

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
    queries[name] = migrateProcedure(procedure as any);
  }

  for (const [name, procedure] of Object.entries(oldRouter._def.mutations)) {
    mutations[name] = migrateProcedure(procedure as any);
  }

  for (const [name, procedure] of Object.entries(
    oldRouter._def.subscriptions,
  )) {
    subscriptions[name] = migrateProcedure(procedure as any);
  }

  const newRouter = createRouterWithContext<any>({
    transformer,
    errorFormatter,
  })({
    mutations,
    queries,
    subscriptions,
  });

  return newRouter as any;
}
