import { AnyRouter } from '../router';
import { TRPCResponse } from '../rpc';

function transformTRPCResponseItem(
  router: AnyRouter,
  item: TRPCResponse,
): TRPCResponse {
  if ('error' in item) {
    return {
      ...item,
      error: router._def.transformer.output.serialize(item.error),
    };
  }
  if (item.result.type !== 'data') {
    return item;
  }
  return {
    ...item,
    result: {
      ...item.result,
      data: router._def.transformer.output.serialize(item.result.data),
    },
  };
}

/**
 * Takes a unserialized `TRPCResponse` and serializes it with the router's transformers
 **/
export function transformTRPCResponse<
  TResponse extends TRPCResponse | TRPCResponse[],
>(router: AnyRouter, itemOrItems: TResponse) {
  return Array.isArray(itemOrItems)
    ? itemOrItems.map((item) => transformTRPCResponseItem(router, item))
    : transformTRPCResponseItem(router, itemOrItems);
}
