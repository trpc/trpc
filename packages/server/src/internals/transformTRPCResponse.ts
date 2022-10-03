import { AnyRouter } from '../core/router';
import { TRPCResponse, TRPCResponseMessage } from '../rpc';

function transformTRPCResponseItem<
  TResponseItem extends TRPCResponse | TRPCResponseMessage,
>(router: AnyRouter, item: TResponseItem): TResponseItem {
  if ('error' in item) {
    return {
      ...item,
      error: router._def._config.transformer.output.serialize(item.error),
    };
  }

  if ('data' in item.result) {
    return {
      ...item,
      result: {
        ...item.result,
        data: router._def._config.transformer.output.serialize(
          item.result.data,
        ),
      },
    };
  }

  return item;
}

/**
 * Takes a unserialized `TRPCResponse` and serializes it with the router's transformers
 **/
export function transformTRPCResponse<
  TResponse extends
    | TRPCResponse
    | TRPCResponse[]
    | TRPCResponseMessage
    | TRPCResponseMessage[],
>(router: AnyRouter, itemOrItems: TResponse) {
  return Array.isArray(itemOrItems)
    ? itemOrItems.map((item) => transformTRPCResponseItem(router, item))
    : transformTRPCResponseItem(router, itemOrItems);
}
