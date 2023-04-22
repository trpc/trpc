import { AnyRootConfig, ProcedureParams } from '.';
import { ProcedureBuilder } from './internals';

type AnyProcedureParams = any;

/**
 * This is a compromise. We ban one possible property to ban all arrays.
 * It prevents a whole class of errors while avoiding some TypeScript nastiness
 */
type AntiArray = { length?: never };

type ValidParams = ProcedureParams<
  AnyRootConfig,
  object & AntiArray,
  object & AntiArray,
  object & AntiArray,
  any,
  any,
  object & AntiArray
>;

type Extender<
  TNextBuilder extends ProcedureBuilder<any> = ProcedureBuilder<any>,
> = <TBuilder extends ProcedureBuilder<any>>(
  procedure: TBuilder,
) => TNextBuilder;

type IsValid<T extends Extender> = T extends Extender<infer TNext>
  ? TNext extends ProcedureBuilder<infer $Params>
    ? $Params extends ValidParams
      ? T
      : never
    : never
  : never;

export function createProcedureExtension<
  TNext extends ProcedureBuilder<AnyProcedureParams>,
  TExtender extends Extender<TNext>,
>(
  extender: TExtender extends IsValid<TExtender>
    ? TExtender
    : 'Invalid Extension: Contexts and Inputs may only be objects or never',
): typeof extender {
  return extender;
}
