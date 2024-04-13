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
