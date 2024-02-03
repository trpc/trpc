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
  jsonHttpRequester,
  resolveHTTPLinkOptions,
} from './internals/httpUtils';
import type { HTTPHeaders, Operation, TRPCLink } from './types';

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

export function httpLinkFactory(factoryOpts: { requester: Requester }) {
  return <TRouter extends AnyRouter>(
    opts: HTTPLinkOptions<TRouter['_def']['_config']['$types']>,
  ): TRPCLink<TRouter> => {
    const resolvedOpts = resolveHTTPLinkOptions(opts);

    return () =>
      ({ op }) =>
        observable((observer) => {
          const { path, input, type } = op;
          const { promise, cancel } = factoryOpts.requester({
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
          promise
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
            cancel();
          };
        });
  };
}

/**
 * @link https://trpc.io/docs/v11/client/links/httpLink
 */
export const httpLink = httpLinkFactory({ requester: jsonHttpRequester });
