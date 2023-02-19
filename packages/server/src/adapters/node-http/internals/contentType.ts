import { AnyRouter } from '../../../core';
import { BaseContentTypeHandler } from '../../../http/contentType';
import {
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
