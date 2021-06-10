import {
  CombinedDataTransformer,
  DataTransformerOptions,
} from '../transformer';

export function getCombinedDataTransformer(
  transformer: DataTransformerOptions | undefined = {
    serialize: (value) => value,
    deserialize: (value) => value,
  },
): CombinedDataTransformer {
  const combinedTransformer =
    'input' in transformer
      ? transformer
      : { input: transformer, output: transformer };

  return combinedTransformer;
}
