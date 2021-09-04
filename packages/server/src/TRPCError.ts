import { TRPC_ERROR_CODE_KEY } from './rpc/codes';
import { getMessageFromUnkownError } from './internals/errors';

export class TRPCError extends Error {
  /**
   * @deprecated use `cause`
   */
  public readonly originalError?: unknown;
  public readonly cause?: unknown;
  public readonly code;

  constructor(opts: {
    message?: string;
    code: TRPC_ERROR_CODE_KEY;
    /**
     * @deprecated use `cause`
     */
    originalError?: unknown;
    cause?: unknown;
  }) {
    const cause = opts.cause ?? opts.originalError;
    const code = opts.code;
    const message = opts.message ?? getMessageFromUnkownError(cause, code);

    super(message);

    this.code = code;
    this.cause = this.originalError = cause;
    this.name = 'TRPCError';

    Object.setPrototypeOf(this, new.target.prototype);
  }
}
