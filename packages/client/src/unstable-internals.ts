import type {
  AnyRootTypes,
  CombinedDataTransformer,
  DataTransformerOptions,
  TypeError,
} from '@trpc/server/unstable-core-do-not-import';

export type CoercedTransformerParameters = {
  transformer?: DataTransformerOptions;
};

type TransformerOptionYes = {
  /**
   * Data transformer
   *
   * You must use the same transformer on the backend and frontend
   * @link https://trpc.io/docs/v11/data-transformers
   **/
  transformer: DataTransformerOptions;
};
type TransformerOptionNo = {
  /**
   * Data transformer
   *
   * You must use the same transformer on the backend and frontend
   * @link https://trpc.io/docs/v11/data-transformers
   **/
  transformer?: TypeError<'You must define a transformer on your your `initTRPC`-object first'>;
};

export type TransformerOptions<
  TRoot extends Pick<AnyRootTypes, 'transformer'>,
> = TRoot['transformer'] extends true
  ? TransformerOptionYes
  : TransformerOptionNo;
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
