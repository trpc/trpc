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
  TRouter extends AnyRouter,
  TRequest extends NodeHTTPRequest,
  TResponse extends NodeHTTPResponse,
> extends BaseContentTypeHandler<
    NodeHTTPRequestHandlerOptions<TRouter, TRequest, TResponse> & {
      query: URLSearchParams;
    }
  > {}
