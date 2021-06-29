import { TRPCError } from '../TRPCError';

/* istanbul ignore next */
/**
 * @deprecated
 */
export const httpError = {
  /**
   * @deprecated use `new TRPCError({ code: 'FORBIDDEN', message: '... })`
   */
  forbidden: (message?: string) =>
    new TRPCError({ message, code: 'FORBIDDEN' }),
  /**
   * @deprecated use `new TRPCError({ code: 'UNAUTHORIZED', message: '... })`
   */
  unauthorized: (message?: string) =>
    new TRPCError({ message, code: 'UNAUTHORIZED' }),
  /**
   * @deprecated use `new TRPCError({ code: 'BAD_REQUEST', message: '... })`
   */
  badRequest: (message?: string) =>
    new TRPCError({ message, code: 'BAD_REQUEST' }),
  /**
   * @deprecated use `new TRPCError({ code: 'METHOD_NOT_FOUND', message: '... })`
   */
  notFound: (message?: string) =>
    new TRPCError({ message, code: 'PATH_NOT_FOUND' }),
};
