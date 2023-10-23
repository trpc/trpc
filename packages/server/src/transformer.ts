import {
  createTson,
  TsonAsyncOptions,
  tsonBigint,
  tsonDate,
  tsonMap,
  tsonNumberGuard,
  tsonRegExp,
  tsonSet,
  tsonSymbol,
  tsonUndefined,
  tsonUnknownObjectGuard,
  tsonURL,
} from 'tupleson';

/**
 * @public
 */
export interface DataTransformer {
  serialize(object: any): any;
  deserialize(object: any): any;
}

interface InputDataTransformer extends DataTransformer {
  /**
   * This function runs **on the client** before sending the data to the server.
   */
  serialize(object: any): any;
  /**
   * This function runs **on the server** to transform the data before it is passed to the resolver
   */
  deserialize(object: any): any;
}

interface OutputDataTransformer extends DataTransformer {
  /**
   * This function runs **on the server** before sending the data to the client.
   */
  serialize(object: any): any;
  /**
   * This function runs **only on the client** to transform the data sent from the server.
   */
  deserialize(object: any): any;
}

/**
 * @public
 */
export interface CombinedDataTransformer {
  /**
   * Specify how the data sent from the client to the server should be transformed.
   */
  input: InputDataTransformer;
  /**
   * Specify how the data sent from the server to the client should be transformed.
   */
  output: OutputDataTransformer;
}

/**
 * @public
 */
export type CombinedDataTransformerClient = {
  input: Pick<CombinedDataTransformer['input'], 'serialize'>;
  output: Pick<CombinedDataTransformer['output'], 'deserialize'>;
};

/**
 * @public
 */
export type DataTransformerOptions = CombinedDataTransformer | DataTransformer;

/**
 * @public
 * @deprecated
 * Deprecated in favor of `CombinedDataTransformerOptions` as this causes issues when doing SSR
 * - https://github.com/trpc/trpc/issues/4130
 */
export type ClientDataTransformerOptions =
  | CombinedDataTransformerClient
  | DataTransformer;

/**
 * @internal
 */
export type DefaultDataTransformer = CombinedDataTransformer & {
  _default: true;
};

/**
 * @internal
 * todo: This is not used if TSON is enabled - does the default TSON transformer need a `_default` flag?
 */
export const defaultTransformer: DefaultDataTransformer = {
  _default: true,
  input: { serialize: (obj) => obj, deserialize: (obj) => obj },
  output: { serialize: (obj) => obj, deserialize: (obj) => obj },
};

export type TrpcTuplesonConfig =
  | TsonAsyncOptions
  | {
      input: TsonAsyncOptions;
      output: TsonAsyncOptions;
    };

/**
 * @internal
 */
export function getDataTransformer<
  TOpts extends {
    transformer?: DataTransformerOptions | undefined;
    experimental_tuplesonOptions?: TrpcTuplesonConfig;
  },
>(opts: TOpts | undefined) {
  const transformer = opts?.experimental_tuplesonOptions
    ? getTsonTransformer(opts)
    : getLegacyTransformer(opts);

  return transformer;
}

function getLegacyTransformer<TTransformer extends DataTransformerOptions>(
  opts: { transformer?: TTransformer } | undefined,
): CombinedDataTransformer {
  const transformer = opts?.transformer;
  if (!transformer) {
    return defaultTransformer;
  }
  if ('input' in transformer) {
    return transformer;
  }
  return {
    input: transformer,
    output: transformer,
  };
}

function getTsonTransformer<
  TOpts extends {
    experimental_tuplesonOptions?: TrpcTuplesonConfig | undefined;
    transformer?: DataTransformerOptions | undefined;
  },
>(opts: TOpts | undefined) {
  if (!opts?.experimental_tuplesonOptions) {
    throw new Error(
      'TSON is not enabled. This should not happen; it is a bug.',
    );
  }

  const officialTsonSyncHandlers = [
    tsonBigint,
    tsonDate,
    tsonRegExp,
    tsonSet,
    tsonMap,
    tsonUndefined,
    tsonNumberGuard,
    tsonURL,
    tsonSymbol,
  ] as const;

  const tsonConfig = opts.experimental_tuplesonOptions;
  const noLegacyTransformer = opts.transformer === undefined;

  type Handler = TsonAsyncOptions['types'][number];

  const old = getLegacyTransformer(opts);

  function _createTson(inOut: 'input' | 'output') {
    const userSyncHandlers = (
      'input' in tsonConfig ? tsonConfig[inOut] : tsonConfig
    ).types?.filter(
      (type): type is Exclude<Handler, { async: true }> => !type.async,
    );

    return createTson({
      ...tsonConfig,
      types: [
        ...(userSyncHandlers ?? officialTsonSyncHandlers),
        ...(noLegacyTransformer
          ? // enforced to mitigate prototype pollution attacks
            // unfortunately not compatible with the legacy transformer API
            [tsonUnknownObjectGuard]
          : [
              {
                key: 'unknown',
                test: () => true,
                serialize: (data: unknown) => old[inOut].serialize(data),
                deserialize: (data: unknown) => old[inOut].deserialize(data),
              },
            ]),
      ],
    });
  }

  return {
    input: _createTson('input'),
    output: _createTson('output'),
  };
}
