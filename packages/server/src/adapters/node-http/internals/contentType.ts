// @trpc/server
import type { AnyRouter } from '../../../@trpc/server';
// @trpc/server/http
import type { BaseContentTypeHandler } from '../../../@trpc/server/http';
import type {
  NodeHTTPRequest,
  NodeHTTPRequestHandlerOptions,
  NodeHTTPResponse,
} from '../types';

export interface NodeHTTPContentTypeHandler<
  TRequest extends NodeHTTPRequest,
  TResponse extends NodeHTTPResponse,
> extends BaseContentTypeHandler<
    NodeHTTPRequestHandlerOptions<AnyRouter, TRequest, TResponse> & {
      query: URLSearchParams;
    }
  > {}

export function createNodeHTTPContentTypeHandler(
  contentTypeHandler: NodeHTTPContentTypeHandler<
    NodeHTTPRequest,
    NodeHTTPResponse
  >,
) {
  return <
    TRequest extends NodeHTTPRequest,
    TResponse extends NodeHTTPResponse,
  >(): NodeHTTPContentTypeHandler<TRequest, TResponse> =>
    contentTypeHandler as any;
}
