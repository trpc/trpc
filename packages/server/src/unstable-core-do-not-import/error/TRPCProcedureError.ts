import type { TRPCErrorShape } from '../rpc';

export class TRPCProcedureError<
  TShape extends TRPCErrorShape = TRPCErrorShape,
> extends Error {
  public readonly shape: TShape;

  constructor(shape: TShape, opts?: { cause?: unknown }) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore https://github.com/tc39/proposal-error-cause
    super(shape.message, opts?.cause ? { cause: opts.cause } : undefined);
    this.name = 'TRPCProcedureError';
    this.shape = shape;
  }
}
