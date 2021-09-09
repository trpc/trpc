/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * @public
 */
export type DataTransformer = {
  serialize(object: any): any;
  deserialize(object: any): any;
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
