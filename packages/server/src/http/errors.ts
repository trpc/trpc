import { TRPCError } from '../errors';
import { TRPC_ERROR_CODES_BY_KEY, TRPC_ERROR_CODE_NUMBER } from '../jsonrpc2';

/* istanbul ignore next */
/**
 * @deprecated
 */
export const httpError = {
  /**
   * @deprecated use `new TRPCError({ code: 'FORBIDDEN', message: '... })`
   */
  forbidden: (message = 'FORBIDDEN') =>
    new TRPCError({ message, code: 'FORBIDDEN' }),
  /**
   * @deprecated use `new TRPCError({ code: 'UNAUTHORIZED', message: '... })`
   */
  unauthorized: (message = 'UNAUTHORIZED') =>
    new TRPCError({ message, code: 'UNAUTHORIZED' }),
  /**
   * @deprecated use `new TRPCError({ code: 'BAD_REQUEST', message: '... })`
   */
  badRequest: (message = 'BAD_REQUEST') =>
    new TRPCError({ message, code: 'BAD_REQUEST' }),
  /**
   * @deprecated use `new TRPCError({ code: 'NOT_FOUND', message: '... })`
   */
  notFound: (message = 'NOT_FOUND') =>
    new TRPCError({ message, code: 'NOT_FOUND' }),
};

export function getStatusCodeFromError<
  TError extends { code?: number } | undefined,
>(err: TError): TRPC_ERROR_CODE_NUMBER {
  const code = err?.code;
  if (code && code in TRPC_ERROR_CODES_BY_KEY) {
    return (TRPC_ERROR_CODES_BY_KEY as any)[code] as TRPC_ERROR_CODE_NUMBER;
  }
  return TRPC_ERROR_CODES_BY_KEY.INTERNAL_SERVER_ERROR;
}
