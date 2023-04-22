import { AnyRootConfig, ProcedureParams } from '.';
import { ProcedureBuilder } from './internals';

type AnyProcedureParams = ProcedureParams<
  AnyRootConfig,
  any,
  any,
  any,
  any,
  any,
  // Disallow meta setting for now
  // tRPC may need some tweaks to allow extension of Meta types like ctx/input can be
  never
>;

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
  TNextBuilder extends ProcedureBuilder<AnyProcedureParams> = ProcedureBuilder<AnyProcedureParams>,
> = <TBuilder extends ProcedureBuilder<AnyProcedureParams>>(
  procedure: TBuilder,
) => TNextBuilder;

type IsValid<TExtender extends Extender> = TExtender extends Extender<
  infer TNext
>
  ? TNext extends ProcedureBuilder<infer $Params>
    ? $Params extends ValidParams
      ? TExtender
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
