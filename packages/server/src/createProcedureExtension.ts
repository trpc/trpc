import { AnyRootConfig, ProcedureParams } from '.';
import {
  AntiArray,
  DefaultRoot,
  IfObject,
  Root,
} from './core/internals/procedureBuilder';
import { ProcedureBuilder } from './internals';
import { Simplify } from './types';

// Must match ExtensionPrequisites in structure
export type BaseParams<TRootConfig extends Root = DefaultRoot> = Simplify<
  ProcedureParams<
    any,
    IfObject<TRootConfig['context'], any>,
    any,
    any,
    any,
    any,
    IfObject<TRootConfig['meta'], never>
  >
>;

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

export const createProcedureExtension =
  withPrequisites<DefaultRoot>().createProcedureExtension;
