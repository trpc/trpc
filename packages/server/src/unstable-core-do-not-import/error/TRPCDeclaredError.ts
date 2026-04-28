import type { TRPC_ERROR_CODE_KEY } from '../rpc/codes';
import { TRPC_ERROR_CODES_BY_KEY } from '../rpc/codes';
import type { TRPCDeclaredErrorMeta, TRPCErrorShape } from '../rpc/envelopes';
import { TRPCError } from './TRPCError';

export const trpcDeclaredErrorSymbol = Symbol('trpc.declaredError');
const trpcDowngradedDeclaredErrorSymbol = Symbol(
  'trpc.downgradedDeclaredError',
);

export type InferTRPCDeclaredErrorShape<TClass> = TClass extends {
  readonly __trpcDeclaredErrorShape: infer TShape extends TRPCErrorShape;
}
  ? TShape
  : never;

export type AnyTRPCDeclaredErrorClass = {
  new (
    ...args: any[]
  ): TRPCError & { readonly [trpcDeclaredErrorSymbol]: true };
  readonly __trpcDeclaredErrorShape: TRPCErrorShape;
};

type DeclaredErrorShape<
  TCode extends TRPC_ERROR_CODE_KEY,
  TDeclaredErrorKey extends string,
  TData extends object,
> = TRPCErrorShape<TData, TRPCDeclaredErrorMeta<TDeclaredErrorKey>> & {
  code: (typeof TRPC_ERROR_CODES_BY_KEY)[TCode];
  message: TCode;
};

interface TRPCDeclaredErrorInstance<
  TData extends object = object,
  TMessage extends string = string,
  TDeclaredErrorKey extends string = string,
> extends TRPCError {
  readonly [trpcDeclaredErrorSymbol]: true;
  [trpcDowngradedDeclaredErrorSymbol]?: TRPCError;
  message: TMessage;
  toShape(): DeclaredErrorShape<any, TDeclaredErrorKey, TData>;
}

export function isTRPCDeclaredError(
  error: TRPCError,
): error is TRPCError & TRPCDeclaredErrorInstance {
  return trpcDeclaredErrorSymbol in error;
}

function isRegistered(
  error: TRPCError & TRPCDeclaredErrorInstance,
  declaredErrors: readonly AnyTRPCDeclaredErrorClass[] | undefined,
) {
  if (!declaredErrors?.length) {
    return false;
  }

  return declaredErrors.some(
    (RegisteredDeclaredError) => error instanceof RegisteredDeclaredError,
  );
}

export function resolveRegisteredDeclaredErrorOrDowngrade(
  error: TRPCError & TRPCDeclaredErrorInstance,
  opts?: {
    declaredErrors?: readonly AnyTRPCDeclaredErrorClass[];
    path?: string;
  },
): TRPCError {
  if (isRegistered(error, opts?.declaredErrors)) {
    return error;
  }

  const cachedDowngradedError = error[trpcDowngradedDeclaredErrorSymbol];
  if (cachedDowngradedError) {
    return cachedDowngradedError;
  }

  const pathSuffix = opts?.path ? ` in procedure "${opts.path}"` : '';

  // eslint-disable-next-line no-console
  console.warn(
    `Unregistered declared error was thrown${pathSuffix}. Treating it as INTERNAL_SERVER_ERROR and passing it through the error formatter.`,
    error,
  );

  const downgradedError = new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'An unrecognized error occurred',
    cause: error,
  });
  error[trpcDowngradedDeclaredErrorSymbol] = downgradedError;

  return downgradedError;
}

/**
 * Creates a typed error class for per-procedure error definitions.
 *
 * - `code` sets the HTTP and JSON-RPC response code
 * - `key` becomes the canonical client-side discriminator and should be globally unique
 *
 * ```ts
 * const MyError = createTRPCDeclaredError({
 *   code: 'NOT_FOUND',
 *   key: 'USER_NOT_FOUND',
 * })
 *   .data<{
 *     resourceType: 'user';
 *   }>()
 *   .create({
 *     constants: {
 *       resourceType: 'user',
 *     },
 *   });
 *
 * throw new MyError()
 * // error.resourceType === 'user'
 * ```
 */
export function createTRPCDeclaredError<
  const TCode extends TRPC_ERROR_CODE_KEY,
  const TDeclaredErrorKey extends string,
>(opts: {
  code: TCode;
  key: TDeclaredErrorKey;
}): TRPCDeclaredErrorBuilder<TCode, TDeclaredErrorKey, {}>;

// TODO: any isn't okay here, we need to add type safety all the way down
export function createTRPCDeclaredError(opts: {
  code: TRPC_ERROR_CODE_KEY;
  key: string;
}): any {
  return createTRPCDeclaredErrorBuilder(opts);
}

function createTRPCDeclaredErrorBuilder(
  opts: BasicErrorKeys & Record<string, unknown>,
) {
  return {
    data: () => createTRPCDeclaredErrorBuilder(opts),

    create: (createOpts?: {
      defaults?: Record<string, unknown>;
      constants?: Record<string, unknown>;
    }) => {
      return createTRPCDeclaredErrorClass({
        ...opts,
        ...(createOpts?.defaults ?? {}),
        ...(createOpts?.constants ?? {}),
      });
    },
  };
}

function createTRPCDeclaredErrorClass(
  opts: BasicErrorKeys & Record<string, unknown>,
) {
  const { code, key, ...consts } = opts;
  const numericCode = TRPC_ERROR_CODES_BY_KEY[code];

  return class TRPCDeclaredError extends TRPCError {
    static readonly __trpcDeclaredErrorShape = null;
    readonly [trpcDeclaredErrorSymbol] = true as const;
    #rest: Record<string, unknown>;

    constructor(input?: Record<string, unknown>) {
      const rest = input ?? {};
      super({ code, message: code });

      this.#rest = rest;
      const { message: _message, ...instanceFields } = { ...consts, ...rest };
      Object.assign(this, instanceFields);
    }

    toShape(): DeclaredErrorShape<
      typeof code,
      typeof key,
      Record<string, unknown>
    > {
      return {
        code: numericCode,
        message: code,
        '~': {
          kind: 'declared',
          declaredErrorKey: key,
        },
        data: { ...consts, ...this.#rest },
      };
    }
  };
}

//
// Type definitions
//

type BasicErrorKeys = {
  code: TRPC_ERROR_CODE_KEY;
  key: string;
};

type OptionalKeys<T extends object> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? K : never;
}[keyof T];

type ConstructorExtraParams<
  TExtraParams extends Record<string, unknown>,
  TDefaults extends object,
  TConstants extends object,
> = Partial<Pick<TExtraParams, Extract<keyof TExtraParams, keyof TDefaults>>> &
  Required<
    Pick<
      TExtraParams,
      Exclude<
        Exclude<
          Exclude<keyof TExtraParams, OptionalKeys<TExtraParams>>,
          keyof TDefaults
        >,
        keyof TConstants
      >
    >
  > &
  Partial<
    Pick<
      TExtraParams,
      Exclude<
        Exclude<OptionalKeys<TExtraParams>, keyof TDefaults>,
        keyof TConstants
      >
    >
  >;

type ConstructorInput<
  TExtraParams extends Record<string, unknown>,
  TDefaults extends object,
  TConstants extends object,
> = ConstructorExtraParams<TExtraParams, TDefaults, TConstants>;

type DefaultsInput<TExtraParams extends Record<string, unknown>> =
  Partial<TExtraParams>;

type TRPCDeclaredErrorClass<
  TCode extends TRPC_ERROR_CODE_KEY,
  TDeclaredErrorKey extends string,
  TExtraParams extends Record<string, unknown>,
  TDefaults extends object,
  TConstants extends object,
> = ({} extends ConstructorExtraParams<TExtraParams, TDefaults, TConstants>
  ? {
      new (
        input?: ConstructorInput<TExtraParams, TDefaults, TConstants>,
      ): TRPCError &
        TRPCDeclaredErrorInstance<TExtraParams, TCode, TDeclaredErrorKey> &
        Omit<TExtraParams, 'message'>;
    }
  : {
      new (
        input: ConstructorInput<TExtraParams, TDefaults, TConstants>,
      ): TRPCError &
        TRPCDeclaredErrorInstance<TExtraParams, TCode, TDeclaredErrorKey> &
        Omit<TExtraParams, 'message'>;
    }) & {
  readonly __trpcDeclaredErrorShape: DeclaredErrorShape<
    TCode,
    TDeclaredErrorKey,
    TExtraParams
  >;
};

type TRPCDeclaredErrorBuilder<
  TCode extends TRPC_ERROR_CODE_KEY,
  TDeclaredErrorKey extends string,
  TExtraParams extends Record<string, unknown>,
> = {
  data<
    const TNewExtraParams extends Record<string, unknown>,
  >(): TRPCDeclaredErrorBuilder<TCode, TDeclaredErrorKey, TNewExtraParams>;
  create(): TRPCDeclaredErrorClass<
    TCode,
    TDeclaredErrorKey,
    TExtraParams,
    {},
    {}
  >;
  create<
    const TDefaults extends Partial<TExtraParams> = {},
    const TConstants extends Partial<TExtraParams> = {},
  >(opts: {
    /**
     * Define default value values, optionally overridable in the error constructor
     */
    defaults?: DefaultsInput<TExtraParams> & TDefaults;
    /**
     * Define permanent values, keys set here will not appear in the error constructor
     */
    constants?: DefaultsInput<TExtraParams> & TConstants;
  }): TRPCDeclaredErrorClass<
    TCode,
    TDeclaredErrorKey,
    TExtraParams,
    TDefaults,
    TConstants
  >;
};
