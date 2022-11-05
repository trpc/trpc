/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/naming-convention */

/**
 * @public
 */
 export type DataTransformer = {
  serialize<R extends any>(
    object: any
  ): R extends Promise<infer _U> ? never : R;
  deserialize<R extends any>(
    object: any
  ): R extends Promise<infer _U> ? never : R;
};

/**
 * @public
 */
export type CombinedDataTransformer = {
  input: DataTransformer;
  output: DataTransformer;
};

/**
 * @public
 */
export type CombinedDataTransformerClient = {
  input: Pick<DataTransformer, 'serialize'>;
  output: Pick<DataTransformer, 'deserialize'>;
};

/**
 * @public
 */
export type DataTransformerOptions = DataTransformer | CombinedDataTransformer;

/**
 * @public
 */
export type ClientDataTransformerOptions =
  | DataTransformer
  | CombinedDataTransformerClient;

/**
 * @internal
 */
export function getDataTransformer(
  transformer: DataTransformerOptions,
): CombinedDataTransformer {
  if ('input' in transformer) {
    return transformer;
  }
  return { input: transformer, output: transformer };
}

/**
 * @internal
 */
export type DefaultDataTransformer = CombinedDataTransformer & {
  _default: true;
};

/**
 * @internal
 */
export const defaultTransformer: DefaultDataTransformer = {
  _default: true,
  input: { serialize: (obj) => obj, deserialize: (obj) => obj },
  output: { serialize: (obj) => obj, deserialize: (obj) => obj },
};
