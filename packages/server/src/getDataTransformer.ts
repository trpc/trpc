import {
  CombinedDataTransformer,
  DataTransformerOptions,
  defaultTransformer,
  TrpcTuplesonConfig,
} from '@trpc/server';
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
