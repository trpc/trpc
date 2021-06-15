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
   * @deprecated use `new TRPCError({ code: 'NOT_FOUND', message: '... })`
   */
  notFound: (message = 'NOT_FOUND') =>
    new TRPCError({ message, code: 'NOT_FOUND' }),
};
