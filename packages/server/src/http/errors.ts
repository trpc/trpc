import { TRPCError } from '../errors';

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
   * @deprecated use `new TRPCError({ code: 'METHOD_NOT_FOUND', message: '... })`
   */
  notFound: (message = 'METHOD_NOT_FOUND') =>
    new TRPCError({ message, code: 'METHOD_NOT_FOUND' }),
};
