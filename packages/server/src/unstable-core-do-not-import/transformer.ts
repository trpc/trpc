import type { AnyRootTypes, RootConfig } from './rootConfig';
import type { AnyRouter, inferRouterError } from './router';
import type {
  TRPCResponse,
  TRPCResponseMessage,
  TRPCResultMessage,
} from './rpc';
import { isObject } from './utils';

/**
 * A transformer that serializes and deserializes data the same way in
 * both directions, such as `superjson`.
 * @see https://trpc.io/docs/server/data-transformers#datatransformer-interface
 * @public
 */
export interface DataTransformer {
  serialize(object: any): any;
  deserialize(object: any): any;
}

interface InputDataTransformer extends DataTransformer {
  /**
   * This function runs **on the client** before sending the data to the server.
   */
  serialize(object: any): any;
  /**
   * This function runs **on the server** to transform the data before it is passed to the resolver
   */
  deserialize(object: any): any;
}

interface OutputDataTransformer extends DataTransformer {
  /**
   * This function runs **on the server** before sending the data to the client.
   */
  serialize(object: any): any;
  /**
   * This function runs **only on the client** to transform the data sent from the server.
   */
  deserialize(object: any): any;
}

/**
 * A transformer with one serializer for inputs and another for outputs.
 * @see https://trpc.io/docs/server/data-transformers#different-transformers-for-upload-and-download
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
 * The half of a combined transformer the client uses: serializing inputs
 * and deserializing outputs.
 * @public
 */
export type CombinedDataTransformerClient = {
  input: Pick<CombinedDataTransformer['input'], 'serialize'>;
  output: Pick<CombinedDataTransformer['output'], 'deserialize'>;
};

/**
 * A transformer: one for both directions, or separate ones for inputs and
 * outputs.
 * @see https://trpc.io/docs/server/data-transformers
 * @public
 */
export type DataTransformerOptions = CombinedDataTransformer | DataTransformer;

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
export const defaultTransformer: CombinedDataTransformer = {
  input: { serialize: (obj) => obj, deserialize: (obj) => obj },
  output: { serialize: (obj) => obj, deserialize: (obj) => obj },
};

function transformTRPCResponseItem<
  TResponseItem extends TRPCResponse | TRPCResponseMessage,
>(config: RootConfig<AnyRootTypes>, item: TResponseItem): TResponseItem {
  if ('error' in item) {
    return {
      ...item,
      error: config.transformer.output.serialize(item.error),
    };
  }

  if ('data' in item.result) {
    return {
      ...item,
      result: {
        ...item.result,
        data: config.transformer.output.serialize(item.result.data),
      },
    };
  }

  return item;
}

/**
 * Serializes a response, or a list of them, with the router's output
 * transformer. Meant for custom adapters.
 **/
export function transformTRPCResponse<
  TResponse extends
    | TRPCResponse
    | TRPCResponse[]
    | TRPCResponseMessage
    | TRPCResponseMessage[],
>(config: RootConfig<AnyRootTypes>, itemOrItems: TResponse) {
  return Array.isArray(itemOrItems)
    ? itemOrItems.map((item) => transformTRPCResponseItem(config, item))
    : transformTRPCResponseItem(config, itemOrItems);
}

// FIXME:
// - the generics here are probably unnecessary
// - the RPC-spec could probably be simplified to combine HTTP + WS
/** @internal */
function transformResultInner<TRouter extends AnyRouter, TOutput>(
  response:
    | TRPCResponse<TOutput, inferRouterError<TRouter>>
    | TRPCResponseMessage<TOutput, inferRouterError<TRouter>>,
  transformer: DataTransformer,
) {
  if ('error' in response) {
    const error = transformer.deserialize(
      response.error,
    ) as inferRouterError<TRouter>;
    return {
      ok: false,
      error: {
        ...response,
        error,
      },
    } as const;
  }

  const result = {
    ...response.result,
    ...((!response.result.type || response.result.type === 'data') && {
      type: 'data',
      data: transformer.deserialize(response.result.data),
    }),
  } as TRPCResultMessage<TOutput>['result'];
  return { ok: true, result } as const;
}

class TransformResultError extends Error {
  constructor() {
    super('Unable to transform response from server');
  }
}

/**
 * Transforms and validates that the result is a valid TRPCResponse
 * @internal
 */
export function transformResult<TRouter extends AnyRouter, TOutput>(
  response:
    | TRPCResponse<TOutput, inferRouterError<TRouter>>
    | TRPCResponseMessage<TOutput, inferRouterError<TRouter>>,
  transformer: DataTransformer,
): ReturnType<typeof transformResultInner> {
  let result: ReturnType<typeof transformResultInner>;
  try {
    // Use the data transformers on the JSON-response
    result = transformResultInner(response, transformer);
  } catch {
    throw new TransformResultError();
  }

  // check that output of the transformers is a valid TRPCResponse
  if (
    !result.ok &&
    (!isObject(result.error.error) ||
      typeof result.error.error['code'] !== 'number')
  ) {
    throw new TransformResultError();
  }
  if (result.ok && !isObject(result.result)) {
    throw new TransformResultError();
  }
  return result;
}
