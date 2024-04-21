import { TRPCError } from '../../@trpc/server';
import type { BaseContentTypeHandler } from '../../@trpc/server/http';
// eslint-disable-next-line no-restricted-imports
import type { Maybe } from '../../unstable-core-do-not-import/types';

export function selectContentHandlerOrUnsupportedMediaType<
  THandlerOpts,
  THandler extends BaseContentTypeHandler<THandlerOpts>,
>(handlers: THandler[], opts: THandlerOpts) {
  let handler: THandler | undefined;
  let received: Maybe<string> = undefined;

  for (const h of handlers) {
    const match = h.isMatch(opts);
    received = match.received;
    if (match.match) {
      handler = h;
      break;
    }
  }

  if (!handler) {
    return [
      undefined,
      new TRPCError({
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: `Invalid Content-Type header '${received}'. This request may not be supported by your tRPC Adapter, or possibly by tRPC at all`,
      }),
    ] as const;
  }

  return [handler] as const;
}
