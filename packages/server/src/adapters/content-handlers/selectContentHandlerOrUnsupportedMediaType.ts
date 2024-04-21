import { TRPCError } from '../../@trpc/server';
import type {
  BaseContentTypeHandler,
  HTTPHeaders,
} from '../../@trpc/server/http';

interface MinimalHandlerOpts {
  req: {
    headers: HTTPHeaders | Headers;
  };
}

export function selectContentHandlerOrUnsupportedMediaType<
  THandlerOpts extends MinimalHandlerOpts,
  THandler extends BaseContentTypeHandler<THandlerOpts>,
>(handlers: THandler[], opts: THandlerOpts) {
  const contentType = new Headers(opts.req.headers as HeadersInit).get(
    'content-type',
  );

  const error = new TRPCError({
    code: 'UNSUPPORTED_MEDIA_TYPE',
    message: `Invalid Content-Type header '${contentType}'. This request may not be supported by your tRPC Adapter, or possibly by tRPC at all`,
  });

  if (typeof contentType !== 'string') {
    return [undefined, error] as const;
  }

  const handler = handlers.find((handler) => handler.isMatch(contentType));
  if (!handler) {
    return [undefined, error] as const;
  }

  return [handler] as const;
}
