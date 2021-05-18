/* eslint-disable @typescript-eslint/no-explicit-any */

export type DataTransformer = {
  serialize(object: any): any;
  deserialize(object: any): any;
};

export type CombinedDataTransformer = {
  up: DataTransformer;
  down: DataTransformer;
};
