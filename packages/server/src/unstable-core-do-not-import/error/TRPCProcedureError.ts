import type { TRPCErrorShape } from '../rpc';
import type { TRPCError } from './TRPCError';

export const procedureErrorKeySymbol = Symbol('trpc.procedureErrorKey');
export const procedureErrorShapeSymbol = Symbol('trpc.procedureErrorShape');

export class TRPCProcedureError<
  TShape extends TRPCErrorShape = TRPCErrorShape,
> extends Error {
  public readonly shape: TShape;
  [procedureErrorKeySymbol]?: string;

  constructor(shape: TShape, opts?: { cause?: unknown }) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore https://github.com/tc39/proposal-error-cause
    super(shape.message, opts);
    this.name = 'TRPCProcedureError';
    this.shape = shape;
  }
}

type TRPCErrorWithProcedureShape = TRPCError & {
  [procedureErrorShapeSymbol]?: TRPCErrorShape;
};

export function setProcedureErrorShape(
  error: TRPCError,
  shape: TRPCErrorShape,
): void {
  (error as TRPCErrorWithProcedureShape)[procedureErrorShapeSymbol] = shape;
}

export function getProcedureErrorShape(
  error: TRPCError,
): TRPCErrorShape | undefined {
  return (error as TRPCErrorWithProcedureShape)[procedureErrorShapeSymbol];
}
