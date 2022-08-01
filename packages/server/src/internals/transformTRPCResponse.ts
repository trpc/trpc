import { ContentType } from '../content-type';
import { TRPCResponse, TRPCResponseMessage } from '../rpc';

function transformTRPCResponseItem<
  TResponseItem extends TRPCResponse | TRPCResponseMessage,
>(contentType: ContentType, item: TResponseItem): TResponseItem {
  if ('error' in item) {
    return {
      ...item,
      error: contentType.toString(item.error),
    };
  }

  if ('data' in item.result) {
    return {
      ...item,
      result: {
        ...item.result,
        data: contentType.toString(item.result.data),
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
>(contentType: ContentType, itemOrItems: TResponse) {
  return Array.isArray(itemOrItems)
    ? itemOrItems.map((item) => transformTRPCResponseItem(contentType, item))
    : transformTRPCResponseItem(contentType, itemOrItems);
}
