import type { AnyRootConfig } from '../internals';
import type { TRPCResponse, TRPCResponseMessage } from '../rpc';

function transformTRPCResponseItem<
  TResponseItem extends TRPCResponse | TRPCResponseMessage,
>(config: AnyRootConfig, item: TResponseItem): TResponseItem {
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
 * Takes a unserialized `TRPCResponse` and serializes it with the router's transformers
 **/
export function transformTRPCResponse<
  TResponse extends
    | TRPCResponse
    | TRPCResponse[]
    | TRPCResponseMessage
    | TRPCResponseMessage[],
>(config: AnyRootConfig, itemOrItems: TResponse) {
  return Array.isArray(itemOrItems)
    ? itemOrItems.map((item) => transformTRPCResponseItem(config, item))
    : transformTRPCResponseItem(config, itemOrItems);
}
