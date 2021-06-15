import { ProcedureType } from '../router';
import { TRPC_ERROR_CODE_NUMBER } from './codes';

export type JSONRPC2RequestId = number /*|string  | null*/;
interface JSONRPC2BaseEnvelope {
  id: JSONRPC2RequestId;
  jsonrpc?: '2.0';
}
export interface JSONRPC2BaseError {
  code: TRPC_ERROR_CODE_NUMBER;
  message: string;
}

interface JSONRPC2Request<TMethod extends string = string, TParams = unknown>
  extends JSONRPC2BaseEnvelope {
  method: TMethod;
  params: TParams;
}

interface JSONRPC2ResultResponse<TResult = unknown>
  extends JSONRPC2BaseEnvelope {
  result: TResult;
}
export interface TRPCErrorResponse<
  TError extends JSONRPC2BaseError = JSONRPC2BaseError,
> extends JSONRPC2BaseEnvelope {
  error: TError;
}

export type TRPCRequestId = NonNullable<JSONRPC2RequestId>;

export type JSONRPC2Response<
  TResult = unknown,
  TError extends JSONRPC2BaseError = JSONRPC2BaseError,
> = JSONRPC2ResultResponse<TResult> | TRPCErrorResponse<TError>;
// TRPC specific

export type TRPCRequestEnvelope =
  | JSONRPC2Request<'subscription.stop'>
  | JSONRPC2Request<
      ProcedureType,
      {
        path: string;
        input: unknown;
      }
    >;

export type TRPCReconnectRequest = JSONRPC2Request<'reconnect', undefined>;

export type TRPCResult<TData = unknown> =
  | {
      type: 'data';
      data: TData;
    }
  | {
      type: 'started';
    }
  | {
      type: 'stopped';
    };
export type TRPCResultEnvelope<TData = unknown> = JSONRPC2ResultResponse<
  TRPCResult<TData>
>;

export type TRPCEnvelope<
  TData = unknown,
  TError extends JSONRPC2BaseError = JSONRPC2BaseError,
> = JSONRPC2ResultResponse<TRPCResult<TData>> | TRPCErrorResponse<TError>;

export type TRPCClientIncomingMessage = TRPCEnvelope | TRPCReconnectRequest;
