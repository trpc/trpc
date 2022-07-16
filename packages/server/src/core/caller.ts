/* eslint-disable @typescript-eslint/no-non-null-assertion */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { createProxy } from '../shared';
import { UnsetMarker } from './internals/utils';
import { AnyProcedure, Procedure, ProcedureOptions } from './procedure';
import { AnyRouter, ProcedureRouterRecord } from './router';
import { ProcedureType } from './types';

type AddParamToObject<
  TObject,
  TProperty extends string,
  TParam,
> = TParam extends UnsetMarker
  ? TObject & { [p in TProperty]?: undefined | void }
  : undefined extends TParam
  ? TObject & { [p in TProperty]?: TParam | void }
  : TObject & { [p in TProperty]: TParam };

type DecorateProcedure<TProcedure extends Procedure<any>> = (
  inputAndCtx: AddParamToObject<
    // eslint-disable-next-line @typescript-eslint/ban-types
    AddParamToObject<{}, 'input', TProcedure['_def']['_input_in']>,
    'ctx',
    TProcedure['_def']['_config']['ctx']
  >,
  opts?: ProcedureOptions,
) => Promise<TProcedure['_def']['_output_out']>;

type assertProcedure<T> = T extends Procedure<any> ? T : never;

/**
 * @internal
 */
type DecoratedProcedureRecord<TProcedures extends ProcedureRouterRecord> = {
  [TKey in keyof TProcedures]: TProcedures[TKey] extends AnyRouter
    ? DecoratedProcedureRecord<TProcedures[TKey]['_def']['record']>
    : DecorateProcedure<assertProcedure<TProcedures[TKey]>>;
};

export function createCaller<TRouter extends AnyRouter>(router: TRouter) {
  const proxy = createProxy(({ path, args }) => {
    const fullPath = path.join('.');
    const procedure = router._def.procedures[fullPath] as AnyProcedure;

    let type: ProcedureType = 'query';
    if (procedure._def.mutation) {
      type = 'mutation';
    } else if (procedure._def.subscription) {
      type = 'subscription';
    }

    const inputAndCtx = args[0] as { input: unknown; ctx: unknown };

    return procedure({
      type,
      path: fullPath,
      rawInput: inputAndCtx.input,
      ctx: inputAndCtx.ctx,
    });
  });
  return proxy as DecoratedProcedureRecord<TRouter['_def']['record']>;
}
