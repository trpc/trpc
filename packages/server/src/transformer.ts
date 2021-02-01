/* eslint-disable @typescript-eslint/no-explicit-any */

export type ResponseTransformer = {
  serialize(object: any): any;
  deserialize(object: any): any;
};
