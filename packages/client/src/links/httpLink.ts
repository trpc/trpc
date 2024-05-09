import { observable } from '@trpc/server/observable';
import type {
  AnyRootTypes,
  AnyRouter,
} from '@trpc/server/unstable-core-do-not-import';
import { transformResult } from '@trpc/server/unstable-core-do-not-import';
import { TRPCClientError } from '../TRPCClientError';
import type {
  HTTPLinkBaseOptions,
  HTTPResult,
  Requester,
} from './internals/httpUtils';
import {
  getInput,
  getUrl,
  httpRequest,
  jsonHttpRequester,
  resolveHTTPLinkOptions,
} from './internals/httpUtils';
import {
  isFormData,
  isOctetType,
  type HTTPHeaders,
  type Operation,
  type TRPCLink,
} from './types';

export type HTTPLinkOptions<TRoot extends AnyRootTypes> =
  HTTPLinkBaseOptions<TRoot> & {
    /**
     * Headers to be set on outgoing requests or a callback that of said headers
     * @link http://trpc.io/docs/client/headers
     */
    headers?:
      | HTTPHeaders
      | ((opts: { op: Operation }) => HTTPHeaders | Promise<HTTPHeaders>);
  };

const universalRequester: Requester = (opts) => {
  const input = getInput(opts);

  if (isFormData(input)) {
    if (opts.type !== 'mutation' && opts.methodOverride !== 'POST') {
      throw new Error('FormData is only supported for mutations');
    }

    return httpRequest({
      ...opts,
      // The browser will set this automatically and include the boundary= in it
      contentTypeHeader: undefined,
      getUrl,
      getBody: () => input,
    });
  }

  if (isOctetType(input)) {
    if (opts.type !== 'mutation' && opts.methodOverride !== 'POST') {
      throw new Error('Octet type input is only supported for mutations');
    }

    return httpRequest({
      ...opts,
      contentTypeHeader: 'application/octet-stream',
      getUrl,
      getBody: () => input,
    });
  }

  return jsonHttpRequester(opts);
};

/**
 * @link https://trpc.io/docs/client/links/httpLink
 */
export function httpLink<TRouter extends AnyRouter = AnyRouter>(
  opts: HTTPLinkOptions<TRouter['_def']['_config']['$types']>,
): TRPCLink<TRouter> {
  const resolvedOpts = resolveHTTPLinkOptions(opts);
  return () => {
    return ({ op }) => {
      return observable((observer) => {
        const { path, input, type } = op;

        const request = universalRequester({
          ...resolvedOpts,
          type,
          path,
          input,
          headers() {
            if (!opts.headers) {
              return {};
            }
            if (typeof opts.headers === 'function') {
              return opts.headers({
                op,
              });
            }
            return opts.headers;
          },
        });
        let meta: HTTPResult['meta'] | undefined = undefined;
        request.promise
          .then((res) => {
            meta = res.meta;
            const transformed = transformResult(
              res.json,
              resolvedOpts.transformer.output,
            );

            if (!transformed.ok) {
              observer.error(
                TRPCClientError.from(transformed.error, {
                  meta,
                }),
              );
              return;
            }
            observer.next({
              context: res.meta,
              result: transformed.result,
            });
            observer.complete();
          })
          .catch((cause) => {
            observer.error(TRPCClientError.from(cause, { meta }));
          });

        return () => {
          request.cancel();
        };
      });
    };
  };
}
