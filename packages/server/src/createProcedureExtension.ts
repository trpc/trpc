import { AnyRootConfig, ProcedureParams } from '.';
import { ProcedureBuilder } from './internals';

type AnyProcedureParams = any; //ProcedureParams<any, any, any, any, any, any, any>;

type Extender<
  TNextBuilder extends ProcedureBuilder<any> = ProcedureBuilder<any>,
> = <TBuilder extends ProcedureBuilder<any>>(
  procedure: TBuilder,
) => TNextBuilder;

type IsValid<T extends Extender> = T extends Extender<infer TNext>
  ? TNext extends ProcedureBuilder<infer $Params>
    ? $Params extends { _input_in?: Array<any> } | { _input_out?: Array<any> }
      ? never
      : T
    : never
  : never;

export function createProcedureExtension<
  TNext extends ProcedureBuilder<AnyProcedureParams>,
  TExtender extends Extender<TNext>,
>(
  extender: TExtender extends IsValid<TExtender>
    ? TExtender
    : 'Inputs may only be objects or never',
): typeof extender {
  return extender;
}
