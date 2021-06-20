import { TRPCProcedureErrorEnvelope, TRPCProcedureSuccessEnvelope } from '../';
import { AnyRouter } from '../router';

export interface HTTPSuccessResponseEnvelope<TOutput>
  extends TRPCProcedureSuccessEnvelope<TOutput> {
  statusCode: number;
}

export interface HTTPErrorResponseEnvelope<TRouter extends AnyRouter>
  extends TRPCProcedureErrorEnvelope<TRouter> {
  statusCode: number;
}

export type HTTPResponseEnvelope<TRouter extends AnyRouter, TOutput> =
  | HTTPSuccessResponseEnvelope<TOutput>
  | HTTPErrorResponseEnvelope<TRouter>;
