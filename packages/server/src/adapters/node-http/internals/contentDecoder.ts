import { HTTPRequest } from '@trpc/server/http';
import { AnyRouter } from '../../../core/router';

/**
 * Can be implemented to support special content types regardless of protocol
 */
export type ContentDecoder = {
  isMatch(req: HTTPRequest): boolean;
  decodeInput(opts: {
    req: HTTPRequest;
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
