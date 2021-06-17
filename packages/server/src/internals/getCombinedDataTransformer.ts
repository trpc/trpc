import {
  CombinedDataTransformer,
  DataTransformer,
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

export function getServerDataTransformer(
  transformer: DataTransformerOptions,
): DataTransformer {
  if ('input' in transformer) {
    return {
      deserialize: transformer.input.deserialize,
      serialize: transformer.output.serialize,
    };
  }
  return transformer;
}
