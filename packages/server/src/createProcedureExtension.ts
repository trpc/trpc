import { ProcedureBuilder } from './internals';

export function createProcedureExtension<
  TNext extends ProcedureBuilder<any>,
  TExtender extends <TBuilder extends ProcedureBuilder<any>>(
    procedure: TBuilder,
  ) => TNext,
>(extender: TExtender): TExtender {
  return extender;
}
