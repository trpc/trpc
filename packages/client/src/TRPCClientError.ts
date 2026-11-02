import type {
  inferClientTypes,
  InferrableClientTypes,
  Maybe,
  TRPCErrorResponse,
} from '@trpc/server/unstable-core-do-not-import';
import {
  isObject,
  type DefaultErrorShape,
} from '@trpc/server/unstable-core-do-not-import';

type inferErrorShape<TInferrable extends InferrableClientTypes> =
  inferClientTypes<TInferrable>['errorShape'];
/** What a client error has, whatever its router. */
export interface TRPCClientErrorBase<TShape extends DefaultErrorShape> {
  readonly message: string;
  /** The error as the server's error formatter shaped it, if it came from the server. */
  readonly shape: Maybe<TShape>;
  /** The shape's `data`, such as the tRPC code and HTTP status. */
  readonly data: Maybe<TShape['data']>;
}
/**
 * The shape of a client error for a router or procedure, without the
 * class. Use it to type errors you pass around, such as in React state.
 * @see https://trpc.io/docs/client/vanilla/infer-types#infer-trpcclienterror-types
 */
export type TRPCClientErrorLike<TInferrable extends InferrableClientTypes> =
  TRPCClientErrorBase<inferErrorShape<TInferrable>>;

/**
 * Whether a value is a `TRPCClientError`, typed for a router or procedure.
 * @see https://trpc.io/docs/client/vanilla/error-handling#catching-a-thrown-error
 */
export function isTRPCClientError<TInferrable extends InferrableClientTypes>(
  cause: unknown,
): cause is TRPCClientError<TInferrable> {
  return cause instanceof TRPCClientError;
}

function isTRPCErrorResponse(obj: unknown): obj is TRPCErrorResponse<any> {
  return (
    isObject(obj) &&
    isObject(obj['error']) &&
    typeof obj['error']['code'] === 'number' &&
    typeof obj['error']['message'] === 'string'
  );
}

function getMessageFromUnknownError(err: unknown, fallback: string): string {
  if (typeof err === 'string') {
    return err;
  }
  if (isObject(err) && typeof err['message'] === 'string') {
    return err['message'];
  }
  return fallback;
}

/**
 * The error a client call throws, whether the server sent an error or the
 * request failed.
 * @see https://trpc.io/docs/client/vanilla/error-handling
 */
export class TRPCClientError<TRouterOrProcedure extends InferrableClientTypes>
  extends Error
  implements TRPCClientErrorBase<inferErrorShape<TRouterOrProcedure>>
{
  // oxlint-disable-next-line typescript/ban-ts-comment
  // @ts-ignore override doesn't work in all environments due to "This member cannot have an 'override' modifier because it is not declared in the base class 'Error'"
  /** The error this one wraps, such as a network error. */
  public override readonly cause;
  /** The error as the server's error formatter shaped it, if it came from the server. */
  public readonly shape: Maybe<inferErrorShape<TRouterOrProcedure>>;
  /** The shape's `data`, such as the tRPC code and HTTP status. */
  public readonly data: Maybe<inferErrorShape<TRouterOrProcedure>['data']>;

  /**
   * More about the error, if any. HTTP errors may have the `response` and
   * its `responseJSON`; a failed fetch or unparsable response may have
   * neither.
   */
  public meta;

  constructor(
    message: string,
    opts?: {
      result?: Maybe<TRPCErrorResponse<inferErrorShape<TRouterOrProcedure>>>;
      cause?: Error;
      meta?: Record<string, unknown>;
    },
  ) {
    const cause = opts?.cause;

    // oxlint-disable-next-line typescript/ban-ts-comment
    // @ts-ignore https://github.com/tc39/proposal-error-cause
    super(message, { cause });

    this.meta = opts?.meta;

    this.cause = cause;
    this.shape = opts?.result?.error;
    this.data = opts?.result?.error.data;
    this.name = 'TRPCClientError';

    Object.setPrototypeOf(this, TRPCClientError.prototype);
  }

  /**
   * Turns an error response, an `Error` or another object into a
   * `TRPCClientError`. A `TRPCClientError` is returned as it is.
   */
  public static from<TRouterOrProcedure extends InferrableClientTypes>(
    _cause: Error | TRPCErrorResponse<any> | object,
    opts: { meta?: Record<string, unknown>; cause?: Error } = {},
  ): TRPCClientError<TRouterOrProcedure> {
    const cause = _cause as unknown;

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
    if (isTRPCErrorResponse(cause)) {
      return new TRPCClientError(cause.error.message, {
        ...opts,
        result: cause,
        cause: opts.cause,
      });
    }
    return new TRPCClientError(
      getMessageFromUnknownError(cause, 'Unknown error'),
      {
        ...opts,
        cause: cause as any,
      },
    );
  }
}
