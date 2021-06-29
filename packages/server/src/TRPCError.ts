import { TRPC_ERROR_CODE_KEY } from './rpc/codes';
import { getMessageFromUnkownError } from './internals/errors';

export class TRPCError extends Error {
  public readonly originalError?: unknown;
  public readonly code;

  constructor({
    message,
    code,
    originalError,
  }: {
    message?: string;
    code: TRPC_ERROR_CODE_KEY;
    originalError?: unknown;
  }) {
    super(message ?? getMessageFromUnkownError(originalError, code));
    this.code = code;
    this.originalError = originalError;
    this.name = 'TRPCError';

    Object.setPrototypeOf(this, new.target.prototype);
  }
}
