import type {
  AnyClientTypes,
  CombinedDataTransformer,
  DataTransformerOptions,
  TypeError,
} from '@trpc/server/unstable-core-do-not-import';

/**
 * @internal
 */
export type CoercedTransformerParameters = {
  transformer?: DataTransformerOptions;
};

type TransformerOptionYes = {
  /**
   * Data transformer
   *
   * You must use the same transformer on the backend and frontend
   * @see https://trpc.io/docs/server/data-transformers
   **/
  transformer: DataTransformerOptions;
};
type TransformerOptionNo = {
  /**
   * Data transformer
   *
   * You must use the same transformer on the backend and frontend
   * @see https://trpc.io/docs/server/data-transformers
   **/
  transformer?: TypeError<'You must define a transformer on your `initTRPC`-object first'>;
};

/**
 * @internal
 */
export type TransformerOptions<
  TRoot extends Pick<AnyClientTypes, 'transformer'>,
> = TRoot['transformer'] extends true
  ? TransformerOptionYes
  : TransformerOptionNo;
/**
 * @internal
 */

/**
 * @internal
 */
export function getTransformer(
  transformer:
    | TransformerOptions<{ transformer: false }>['transformer']
    | TransformerOptions<{ transformer: true }>['transformer']
    | undefined,
): CombinedDataTransformer {
  const _transformer =
    transformer as CoercedTransformerParameters['transformer'];
  if (!_transformer) {
    return {
      input: {
        serialize: (data) => data,
        deserialize: (data) => data,
      },
      output: {
        serialize: (data) => data,
        deserialize: (data) => data,
      },
    };
  }
  if ('input' in _transformer) {
    return _transformer;
  }
  return {
    input: _transformer,
    output: _transformer,
  };
}
