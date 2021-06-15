import { ProcedureType } from '../router';
import { TRPC_ERROR_CODE_NUMBER } from './codes';

export type JSONRPC2RequestId = number /*|string  | null*/;
export interface JSONRPC2BaseEnvelope {
  id: JSONRPC2RequestId;
  jsonrpc?: '2.0';
}
export interface JSONRPC2BaseError {
  code: TRPC_ERROR_CODE_NUMBER;
  message: string;
}

export interface JSONRPC2Request<
  TMethod extends string = string,
  TParams = unknown,
> extends JSONRPC2BaseEnvelope {
  method: TMethod;
  params: TParams;
}

export interface JSONRPC2ResultResponse<TResult = unknown>
  extends JSONRPC2BaseEnvelope {
  result: TResult;
}
export interface JSONRPC2ErrorResponse<
  TError extends JSONRPC2BaseError = JSONRPC2BaseError,
> extends JSONRPC2BaseEnvelope {
  error: TError;
}

export type TRPCRequestId = NonNullable<JSONRPC2RequestId>;

export type JSONRPC2Response<
  TResult = unknown,
  TError extends JSONRPC2BaseError = JSONRPC2BaseError,
> = JSONRPC2ResultResponse<TResult> | JSONRPC2ErrorResponse<TError>;
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

export type TRPCSubscriptionResponse = JSONRPC2Response<
  | {
      type: 'data';
      data: unknown;
    }
  | {
      type: 'started';
    }
  | {
      type: 'stopped';
    }
>;

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
export type TRPCResponseEnvelope<TData = unknown> =
  | JSONRPC2ResultResponse<TRPCResult<TData>>
  | JSONRPC2ErrorResponse;
export type TRPCClientMessage = TRPCResponseEnvelope | TRPCReconnectRequest;
