// Note: this should likely be moved to a sort of `@trpc/plugin` package
export type {
  JSONRPC2,
  TRPCClientIncomingMessage,
  TRPCClientIncomingRequest,
  TRPCClientOutgoingMessage,
  TRPCClientOutgoingRequest,
  TRPCErrorResponse,
  TRPCErrorShape,
  TRPCReconnectNotification,
  TRPCRequest,
  TRPCRequestMessage,
  TRPCResponse,
  TRPCResponseMessage,
  TRPCResult,
  TRPCResultMessage,
  TRPCSubscriptionStopNotification,
  TRPCSuccessResponse,
  TRPC_ERROR_CODE_KEY,
  TRPC_ERROR_CODE_NUMBER,
  TRPCConnectionParamsMessage,
} from '../../unstable-core-do-not-import';
export {
  TRPC_ERROR_CODES_BY_KEY,
  TRPC_ERROR_CODES_BY_NUMBER,
  parseTRPCMessage,
} from '../../unstable-core-do-not-import';
