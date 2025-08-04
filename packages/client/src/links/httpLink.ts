import type { AnyTRPCRouter } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import type { TRPCErrorShape, TRPCResponse } from '@trpc/server/rpc';
import {
  jsonlStreamConsumer,
  transformResult,
} from '@trpc/server/unstable-core-do-not-import';
import { TRPCClientError } from '../TRPCClientError';
import type { HTTPLinkOptions } from './HTTPLinkOptions';
import {
  fetchHTTPResponse,
  getBody,
  getUrl,
  httpRequest,
  jsonHttpRequester,
  resolveHTTPLinkOptions,
  type HTTPResult,
  type Requester,
} from './internals/httpUtils';
import { isFormData, isOctetType, type TRPCLink } from './types';

const universalRequester: Requester = (opts) => {
  if ('input' in opts) {
    const { input } = opts;
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
  }

  return jsonHttpRequester(opts);
};

/**
 * @see https://trpc.io/docs/client/links/httpLink
 */
export function httpLink<TRouter extends AnyTRPCRouter>(
  opts: HTTPLinkOptions<TRouter['_def']['_config']['$types']>,
): TRPCLink<TRouter> {
  const resolvedOpts = resolveHTTPLinkOptions(opts);
  const streaming = opts.streaming ?? false;

  return () => {
    return ({ op }) => {
      return observable((observer) => {
        const { path, input, type } = op;
        /* istanbul ignore if -- @preserve */
        if (type === 'subscription') {
          throw new Error(
            'Subscriptions are unsupported by `httpLink` - use `wsLink`',
          );
        }

        const headersFn = () => {
          if (typeof opts.headers === 'function') {
            return opts.headers({
              op,
            });
          }
          return opts.headers ?? {};
        };

        let meta: HTTPResult['meta'] | undefined = undefined;
        const abortController = new AbortController();

        if (!streaming) {
          const request = universalRequester({
            ...resolvedOpts,
            type,
            path,
            input,
            signal: op.signal,
            headers: headersFn,
          });

          request
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
            // Abort the non-streaming request if possible (though universalRequester doesn't expose AbortController)
            // This might need further refinement if granular abort is needed for non-streaming FormData/Octet
          };
        }

        const responsePromise = fetchHTTPResponse({
          ...resolvedOpts,
          signal: op.signal ?? abortController.signal,
          type,
          contentTypeHeader: 'application/json',
          trpcAcceptHeader: 'application/jsonl',
          getUrl,
          getBody,
          inputs: [input],
          path,
          headers: headersFn,
        });

        responsePromise
          .then(async (res) => {
            meta = { response: res };
            if (!res.body) {
              throw new TRPCClientError('Received response without body');
            }

            const [head] = await jsonlStreamConsumer<{
              [key: string]: Promise<TRPCResponse>;
            }>({
              from: res.body,
              deserialize: resolvedOpts.transformer.output.deserialize,
              formatError(opts) {
                const error = opts.error as TRPCErrorShape;
                return TRPCClientError.from({ error });
              },
              abortController,
            });

            const singleResultPromise = head['0'];
            if (!singleResultPromise) {
              throw new TRPCClientError(
                'Received stream without main response',
              );
            }

            let json: TRPCResponse = await Promise.resolve(singleResultPromise);

            if ('result' in json) {
              const result = await Promise.resolve(json.result);
              json = {
                result: {
                  data: await Promise.resolve(result.data),
                },
              };
            }

            if ('error' in json) {
              observer.error(
                TRPCClientError.from(json, {
                  meta,
                }),
              );
            } else if ('result' in json) {
              observer.next({
                context: meta,
                result: json.result,
              });
              observer.complete();
            } else {
              observer.complete();
            }
          })
          .catch((cause) => {
            observer.error(TRPCClientError.from(cause, { meta }));
          });

        return () => {
          abortController.abort();
        };
      });
    };
  };
}
