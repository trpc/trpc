/* eslint-disable @typescript-eslint/no-explicit-any */

export type DataTransformer = {
  serialize(object: any): any;
  deserialize(object: any): any;
};

export type CombinedDataTransformer = {
  input: DataTransformer;
  output: DataTransformer;
};

export type CombinedDataTransformerClient = {
  input: Pick<DataTransformer, 'serialize'>;
  output: Pick<DataTransformer, 'deserialize'>;
};

export type DataTransformerOptions = DataTransformer | CombinedDataTransformer;

export type ClientDataTransformerOptions =
  | DataTransformer
  | CombinedDataTransformerClient;
