import { AnyRouter, inferRouterError, Maybe } from '@trpc/server';
import { TRPCErrorResponse } from '@trpc/server/rpc';

export interface TRPCClientErrorLike<TRouter extends AnyRouter> {
  readonly message: string;
  readonly shape: Maybe<inferRouterError<TRouter>>;
  readonly data: Maybe<inferRouterError<TRouter>['data']>;
}

export class TRPCClientError<TRouter extends AnyRouter>
  extends Error
  implements TRPCClientErrorLike<TRouter>
{
  public readonly cause;
  public readonly shape: Maybe<inferRouterError<TRouter>>;
  public readonly data: Maybe<inferRouterError<TRouter>['data']>;
  public readonly meta;

  constructor(
    message: string,
    opts?: {
      result: Maybe<TRPCErrorResponse<inferRouterError<TRouter>>>;
      cause?: Maybe<Error>;
      meta?: Record<string, unknown>;
    },
  ) {
    const cause = opts?.cause;

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore https://github.com/tc39/proposal-error-cause
    super(message, { cause });

    this.meta = opts?.meta;

    this.cause = cause;
    this.shape = opts?.result?.error;
    this.data = opts?.result?.error.data;
    this.name = 'TRPCClientError';

    Object.setPrototypeOf(this, TRPCClientError.prototype);
  }

  public static from<TRouter extends AnyRouter>(
    cause: Error | TRPCErrorResponse<any>,
    opts: { meta?: Record<string, unknown> } = {},
  ): TRPCClientError<TRouter> {
    if (!(cause instanceof Error)) {
      return new TRPCClientError<TRouter>((cause.error as any).message ?? '', {
        ...opts,
        cause: null,
        result: cause,
      });
    }
    if (cause.name === 'TRPCClientError') {
      return cause as TRPCClientError<any>;
    }

    return new TRPCClientError<TRouter>(cause.message, {
      ...opts,
      cause,
      result: null,
    });
  }
}
