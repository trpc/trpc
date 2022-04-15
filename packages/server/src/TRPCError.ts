import { getMessageFromUnkownError } from './internals/errors';
import { TRPC_ERROR_CODE_KEY } from './rpc/codes';

export class TRPCError extends Error {
  /**
   * @deprecated use `cause`
   */
  public readonly originalError?: Error | undefined;
  public readonly cause?: Error | undefined;
  public readonly code;

  constructor(opts: {
    message?: string;
    code: TRPC_ERROR_CODE_KEY;
    /**
     * @deprecated use `cause`
     */
    originalError?: Error | undefined;
    cause?: Error | undefined;
  }) {
    const cause = opts.cause ?? opts.originalError;
    const code = opts.code;
    const message = opts.message ?? getMessageFromUnkownError(cause, code);

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore https://github.com/tc39/proposal-error-cause
    super(message, { cause });

    this.code = code;
    this.cause = this.originalError = cause;
    this.name = 'TRPCError';

    Object.setPrototypeOf(this, new.target.prototype);
  }
}
