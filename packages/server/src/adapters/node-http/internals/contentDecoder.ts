import { RequestUtils } from '@trpc/server/core/internals/procedureBuilder';
import { HTTPRequest } from '@trpc/server/http';
import { AnyRouter } from '../../../core/router';

// import {
//   NodeHTTPRequest,
//   NodeHTTPRequestHandlerOptions,
//   NodeHTTPResponse,
// } from '../types';

/**
 * Can be implemented to support special content types regardless of protocol
 */
export type ContentDecoder = {
  isMatch(req: HTTPRequest): boolean;
  decodeInput(opts: {
    req: HTTPRequest;
    utils: RequestUtils;
    isBatchCall: boolean;
    router: AnyRouter;
    preprocessedBody: boolean;
  }): Promise<Record<number, unknown>>;
};

export interface HttpJsonContentDecoder extends ContentDecoder {}

export function createNodeHttpContentDecoder(
  contentTypeHandler: HttpJsonContentDecoder,
) {
  return contentTypeHandler;
}

// export interface HttpJsonContentDecoder<
//   TRequest extends NodeHTTPRequest,
//   TResponse extends NodeHTTPResponse,
// > extends ContentDecoder<
//     NodeHTTPRequestHandlerOptions<AnyRouter, TRequest, TResponse> & {
//       query: URLSearchParams;
//     }
//   > {}

// export function createNodeHttpContentDecoder(
//   contentTypeHandler: HttpJsonContentDecoder<NodeHTTPRequest, NodeHTTPResponse>,
// ) {
//   return () => contentTypeHandler;
// }
