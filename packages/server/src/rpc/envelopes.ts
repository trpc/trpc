import { ProcedureType } from '../router';
import { TRPC_ERROR_CODE_NUMBER } from './codes';

type JSONRPC2RequestId = number | string /*|string  | null*/;

// BASE
interface JSONRPC2BaseEnvelope {
  id: JSONRPC2RequestId;
  jsonrpc?: '2.0';
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

// inner types
export interface TRPCErrorShape<
  TCode extends number = TRPC_ERROR_CODE_NUMBER,
  TData = never,
> {
  code: TCode;
  message: string;
  data: TData;
}
export type TRPCRequestId = NonNullable<JSONRPC2RequestId>;

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

// request envelope
export type TRPCRequest =
  | JSONRPC2Request<'subscription.stop'>
  | JSONRPC2Request<
      ProcedureType,
      {
        path: string;
        input: unknown;
      }
    >;

// ok response
export type TRPCResultResponse<TData = unknown> = JSONRPC2ResultResponse<
  TRPCResult<TData>
>;

// response wrapper
export type TRPCResponse<
  TData = unknown,
  TError extends TRPCErrorShape = TRPCErrorShape,
> = TRPCResultResponse<TData> | TRPCErrorResponse<TError>;

export interface TRPCErrorResponse<
  TError extends TRPCErrorShape = TRPCErrorShape,
> extends JSONRPC2BaseEnvelope {
  error: TError;
}

// Special from server -> client
export interface TRPCReconnectNotification {
  id: null;
  jsonrpc?: '2.0';
  method: 'reconnect';
}
export type TRPCClientIncomingMessage =
  | TRPCResponse
  | TRPCReconnectNotification;
