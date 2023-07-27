import {
  AnyRouter,
  DefaultErrorShape,
  inferRouterError,
  Maybe,
} from '@trpc/server';
import { TRPCErrorResponse, TRPCErrorShape } from '@trpc/server/rpc';

type ErrorInferrable = AnyRouter | TRPCErrorShape<number>;

type inferErrorShape<TInferrable extends ErrorInferrable> =
  TInferrable extends AnyRouter ? inferRouterError<TInferrable> : TInferrable;

export interface TRPCClientErrorBase<TShape extends DefaultErrorShape> {
  readonly message: string;
  readonly shape: Maybe<TShape>;
  readonly data: Maybe<TShape['data']>;
}
export type TRPCClientErrorLike<TRouter extends ErrorInferrable> =
  TRPCClientErrorBase<inferErrorShape<TRouter>>;

function isTRPCClientError(cause: Error): cause is TRPCClientError<any> {
  return (
    cause instanceof TRPCClientError ||
    /**
     * @deprecated
     * Delete in next major
     */
    cause.name === 'TRPCClientError'
  );
}

export class TRPCClientError<TRouter extends ErrorInferrable>
  extends Error
  implements TRPCClientErrorBase<inferErrorShape<TRouter>>
{
  public readonly cause;
  public readonly shape: Maybe<inferErrorShape<TRouter>>;
  public readonly data: Maybe<inferErrorShape<TRouter>['data']>;

  /**
   * Additional meta data about the error
   * In the case of HTTP-errors, we'll have `response` and potentially `responseJSON` here
   */
  public meta;

  constructor(
    message: string,
    opts?: {
      result?: Maybe<inferErrorShape<TRouter>>;
      cause?: Error;
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

  public static from<TRouterOrProcedure extends ErrorInferrable>(
    cause: Error | TRPCErrorResponse<any>,
    opts: { meta?: Record<string, unknown> } = {},
  ): TRPCClientError<TRouterOrProcedure> {
    if (!(cause instanceof Error)) {
      return new TRPCClientError<TRouterOrProcedure>(
        cause.error.message ?? '',
        {
          ...opts,
          cause: undefined,
          result: cause as any,
        },
      );
    }
    if (isTRPCClientError(cause)) {
      if (opts.meta) {
        // Decorate with meta error data
        cause.meta = {
          ...cause.meta,
          ...opts.meta,
        };
      }
      return cause;
    }

    return new TRPCClientError<TRouterOrProcedure>(cause.message, {
      ...opts,
      cause,
      result: null,
    });
  }
}
