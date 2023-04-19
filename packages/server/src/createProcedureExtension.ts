import { ProcedureBuilder } from './internals';

export function createProcedureExtension<
  TNext extends ProcedureBuilder<any>,
  TExtender extends <T extends ProcedureBuilder<any>>(procedure: T) => TNext,
>(extender: TExtender): TExtender {
  return extender;
}
