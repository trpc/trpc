/* eslint-disable @typescript-eslint/no-explicit-any */

export type OutputTransformer = {
  serialize(object: any): any;
  deserialize(object: any): any;
};
