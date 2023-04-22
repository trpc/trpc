import { AnyRootConfig, ProcedureParams } from '.';
import { ProcedureBuilder } from './internals';
import { Simplify } from './types';

export type Root = {
  context?: object;
  meta?: object;
};

type IfObject<TType, TFallback> = TType extends object ? TType : TFallback;
type BaseParams<TRootConfig extends Root = Root> = Simplify<
  ProcedureParams<
    AnyRootConfig,
    IfObject<TRootConfig['context'], any>,
    any,
    any,
    any,
    any,
    IfObject<TRootConfig['meta'], never>
  >
>;

/**
 * This is a compromise. We ban one possible property to ban all arrays.
 * It prevents a whole class of errors while avoiding some TypeScript nastiness
 */
type AntiArray = { length?: never };

type ValidParams<TRoot extends Root> = ProcedureParams<
  AnyRootConfig,
  IfObject<TRoot['context'], object & AntiArray>,
  object & AntiArray,
  object & AntiArray,
  any,
  any,
  IfObject<TRoot['meta'], never>
>;

type Extender<
  TRoot extends Root,
  TNextBuilder extends ProcedureBuilder<BaseParams<TRoot>>,
> = <TBuilder extends ProcedureBuilder<BaseParams<TRoot>>>(
  procedure: TBuilder,
) => TNextBuilder;

type IsValid<TExtender extends Extender<any, any>> = TExtender extends Extender<
  infer TRoot,
  infer TNext
>
  ? TNext extends ProcedureBuilder<infer $Params>
    ? $Params extends ValidParams<TRoot>
      ? TExtender
      : never
    : never
  : // I don't understand why this works but it does. Expected `never` but the tests pass this way!
    TExtender;

type Validate<TExtender extends Extender<any, any>> =
  TExtender extends IsValid<TExtender>
    ? TExtender
    : 'Invalid Extension: Contexts and Inputs may only be objects or never';

export function createProcedureExtension<
  TNext extends ProcedureBuilder<BaseParams<Root>>,
  TExtender extends Extender<Root, TNext>,
>(extender: Validate<TExtender>): typeof extender {
  return extender;
}

export function withPrequisites<TRoot extends Root>() {
  function createProcedureExtension<
    TNext extends ProcedureBuilder<BaseParams<TRoot>>,
    TExtender extends Extender<TRoot, TNext>,
  >(extender: Validate<TExtender>): typeof extender {
    return extender;
  }

  return {
    createProcedureExtension,
  };
}
