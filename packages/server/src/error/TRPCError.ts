import {
  getErrorFromUnknown,
  getMessageFromUnknownError,
} from '../error/utils';
import { TRPC_ERROR_CODE_KEY } from '../rpc/codes';

export class TRPCError extends Error {
  public readonly cause?;
  public readonly code;

  constructor(opts: {
    message?: string;
    code: TRPC_ERROR_CODE_KEY;
    cause?: unknown;
  }) {
    const code = opts.code;
    const message =
      opts.message ?? getMessageFromUnknownError(opts.cause, code);
    const cause: Error | undefined =
      opts !== undefined ? getErrorFromUnknown(opts.cause) : undefined;

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore https://github.com/tc39/proposal-error-cause
    super(message, { cause });

    this.code = code;
    this.cause = cause;
    this.name = 'TRPCError';

    Object.setPrototypeOf(this, new.target.prototype);
  }
}
