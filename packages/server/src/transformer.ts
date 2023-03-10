/**
 * @public
 */
export interface DataTransformer {
  serialize(object: any): JsonParseable;
  deserialize(object: JsonParseable): any;
}

type JsonParseable =  boolean | number | string | null | JsonArray | JsonMap;
interface JsonMap {  [key: string]: AnyJson; }
interface JsonArray extends Array<AnyJson> {}

interface InputDataTransformer extends DataTransformer {
  /**
   * This function runs **on the client** before sending the data to the server.
   */
  serialize(object: any): JsonParseable;
  /**
   * This function runs **on the server** to transform the data before it is passed to the resolver
   */
  deserialize(object: JsonParseable): any;
}

interface OutputDataTransformer extends DataTransformer {
  /**
   * This function runs **on the server** before sending the data to the client.
   */
  serialize(object: any): JsonParseable;
  /**
   * This function runs **only on the client** to transform the data sent from the server.
   */
  deserialize(object: JsonParseable): any;
}

/**
 * @public
 */
export interface CombinedDataTransformer {
  /**
   * Specify how the data sent from the client to the server should be transformed.
   */
  input: InputDataTransformer;
  /**
   * Specify how the data sent from the server to the client should be transformed.
   */
  output: OutputDataTransformer;
}

/**
 * @public
 */
export type CombinedDataTransformerClient = {
  input: Pick<CombinedDataTransformer['input'], 'serialize'>;
  output: Pick<CombinedDataTransformer['output'], 'deserialize'>;
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
