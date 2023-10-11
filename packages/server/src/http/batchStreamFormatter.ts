import type { AnyRouter, inferRouterError } from '../core';
import { TRPCResponse } from '../rpc';
import { transformTRPCResponse } from '../shared';
import { getHTTPStatusCode } from './getHTTPStatusCode';
import { HTTPHeaders, ResponseMetaFn } from './internals/types';
import { ResponseMeta } from './types';

export function createBodyFormatter<TRouter extends AnyRouter>({
  style,
  router,
  head,
  onResponseInit = () => ({}),
}: {
  style: 'single' | 'batch' | 'event-stream' | 'json-stream';
  router: TRouter;
  head: { status: number; headers: HTTPHeaders };
  onResponseInit?: (
    args: Partial<
      Pick<Parameters<ResponseMetaFn<TRouter>>[number], 'data' | 'errors'>
    >,
  ) => ResponseMeta;
}) {
  let items: TRPCResponse<unknown, inferRouterError<TRouter>>[] | undefined;
  let buffer:
    | undefined
    | Set<{
        index: number;
        value: TRPCResponse<unknown, inferRouterError<TRouter>>;
      }>;

  let first = true;
  let separator = ',';
  let open = () => '';
  let close;

  const initResponse = (head: { status: number; headers: HTTPHeaders }) => {
    items =
      buffer &&
      Array.from(buffer)
        .sort((a, b) => a.index - b.index)
        .map(({ value }) => value);
    const errors = items?.flatMap((response) =>
      'error' in response ? [response.error] : [],
    );

    if (style.includes('stream')) head.status = 102;
    else head.status = items ? getHTTPStatusCode(items) : 204;

    const meta = onResponseInit({ data: items, errors });

    for (const [key, value] of Object.entries(meta.headers ?? {})) {
      head.headers[key] = value;
    }

    if (meta.status) head.status = meta.status;
  };

  const stringify = (
    data:
      | TRPCResponse<unknown, inferRouterError<TRouter>>
      | TRPCResponse<unknown, inferRouterError<TRouter>>[],
  ) => {
    const serialized = transformTRPCResponse(router._def._config, data);
    return JSON.stringify(serialized);
  };

  switch (style) {
    case 'event-stream':
      separator = '\n\n';
      open = () => {
        initResponse(head);
        return `data: ${JSON.stringify({ result: { type: 'start' } })}\n\n`;
      };
      close = () => `\n\ndata: ${JSON.stringify({ result: { type: 'end' } })}`;
      break;
    case 'json-stream':
      open = () => {
        initResponse(head);
        return '{';
      };
      close = () => '}';
      break;
    case 'batch':
      buffer = new Set();
      close = () => {
        initResponse(head);
        return stringify(items!);
      };
      break;
    case 'single':
      buffer = new Set();
      close = () => {
        initResponse(head);
        return stringify(items![0]!);
      };
      break;
  }

  function format(
    index: number,
    data: TRPCResponse<unknown, inferRouterError<TRouter>>,
  ) {
    const prefix = first ? open() : separator;

    first = false;
    switch (style) {
      case 'event-stream':
        return `${prefix}data: ${stringify(data)}\nid: ${index}`;
      case 'json-stream':
        return `${prefix}"${index}":${stringify(data)}\n`;
      case 'batch':
      case 'single':
        buffer?.add({ index, value: data });
        return '';
    }
  };

  format.end = close;
  return format
}
