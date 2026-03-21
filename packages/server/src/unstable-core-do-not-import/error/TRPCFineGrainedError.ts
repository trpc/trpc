import type { TRPC_ERROR_CODE_KEY } from '../rpc/codes';
import { TRPC_ERROR_CODES_BY_KEY } from '../rpc/codes';
import type { TRPCErrorShape } from '../rpc/envelopes';
import { TRPCError } from './TRPCError';

/**
 * Symbol used to identify fine-grained error instances at runtime.
 */
export const trpcFineGrainedErrorSymbol = Symbol('trpc.fineGrainedError');

/**
 * The base constraint for opts passed to `createTRPCFineGrainedError`.
 * Must contain a tRPC error code string key. May contain any other fields.
 */
export type TRPCFineGrainedErrorOpts = {
  code: TRPC_ERROR_CODE_KEY;
  message?: string;
} & Record<string, unknown>;

/**
 * Infer the wire shape (`TRPCErrorShape`) from a fine-grained error class.
 * - `code` becomes the numeric JSON-RPC code
 * - `message` is always `string`
 * - `data` is everything from opts except `code` and `message`
 */
export type InferTRPCFineGrainedErrorShape<TClass> = TClass extends {
  readonly __trpcFineGrainedErrorOpts: infer TOpts;
}
  ? TOpts extends { code: infer TCode extends TRPC_ERROR_CODE_KEY }
    ? {
        code: (typeof TRPC_ERROR_CODES_BY_KEY)[TCode];
        message: string;
        data: Omit<TOpts, 'code' | 'message'>;
      }
    : never
  : never;

/**
 * Any fine-grained error class (for use in generic constraints).
 */
export type AnyTRPCFineGrainedErrorClass = {
  new (...args: any[]): TRPCError & {
    readonly [trpcFineGrainedErrorSymbol]: true;
  };
  readonly __trpcFineGrainedErrorOpts: TRPCFineGrainedErrorOpts;
};

/**
 * Instance interface for fine-grained errors.
 */
interface TRPCFineGrainedErrorInstance<TOpts extends TRPCFineGrainedErrorOpts> {
  readonly [trpcFineGrainedErrorSymbol]: true;
  readonly opts: TOpts;
  toShape(): TRPCErrorShape;
}

/**
 * Type guard that narrows a `TRPCError` to a fine-grained error instance.
 */
export function isTRPCFineGrainedError(
  error: TRPCError,
): error is TRPCError & TRPCFineGrainedErrorInstance<TRPCFineGrainedErrorOpts> {
  return trpcFineGrainedErrorSymbol in error;
}

/**
 * Creates a fine-grained error class for type-safe per-procedure error definitions
 *
 * - You must register the resulting error in your base procedures
 * - Unregistered TRPCFineGrainedError's will be replaced with a INTERNAL_SERVER_ERROR
 * - These types will be inferred-per-procedure on the client
 * - You can throw a TRPCFineGrainedError from a Middleware or any Procedure type
 *
 * ```ts
 * const MyError = createTRPCFineGrainedError({ code: 'NOT_IMPLEMENTED', reason: 'demo' })
 *
 * publicProcedure.errors([MyError]).query(opts => {
 *   throw new MyError({ reason: 'demo' })
 * })
 * ```
 */
export function createTRPCFineGrainedError<
  TCode extends TRPC_ERROR_CODE_KEY,
  TOpts extends { code: TCode } & Record<string, unknown>,
>(
  defaultOpts: TOpts,
): {
  new (
    overrides?: Partial<Omit<TOpts, 'code'>>,
  ): TRPCError & TRPCFineGrainedErrorInstance<TOpts>;
  readonly __trpcFineGrainedErrorOpts: TOpts;
} {
  const numericCode = TRPC_ERROR_CODES_BY_KEY[defaultOpts.code];

  class TRPCFineGrainedError extends TRPCError {
    readonly [trpcFineGrainedErrorSymbol] = true as const;
    readonly opts: TOpts;

    constructor(overrides?: Partial<Omit<TOpts, 'code'>>) {
      const merged = { ...defaultOpts, ...overrides } as TOpts;
      super({
        code: defaultOpts.code,
        message:
          typeof merged['message'] === 'string'
            ? merged['message']
            : defaultOpts.code,
      });
      this.opts = merged;
    }

    toShape(): TRPCErrorShape {
      const { code: _code, message: _message, ...data } = this.opts;
      return {
        code: numericCode,
        message: this.message,
        data,
      };
    }
  }

  // Static type marker for inference
  Object.defineProperty(TRPCFineGrainedError, '__trpcFineGrainedErrorOpts', {
    value: defaultOpts,
    writable: false,
    enumerable: false,
  });

  return TRPCFineGrainedError as any;
}
