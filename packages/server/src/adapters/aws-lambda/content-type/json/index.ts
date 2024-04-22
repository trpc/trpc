// @trpc/server
import { TRPCError } from '../../../../@trpc/server';
import type {
  AnyRouter,
  CombinedDataTransformer,
} from '../../../../@trpc/server';
import type {
  BaseContentTypeHandler,
  HTTPRequest,
} from '../../../../@trpc/server/http';
import { createConcurrentCache } from '../../../content-handlers/concurrentCache';
import {
  lambdaEventToHTTPBody,
  type APIGatewayEvent,
  type AWSLambdaOptions,
} from '../../utils';

export interface LambdaHTTPContentTypeHandler<
  TRouter extends AnyRouter,
  TEvent extends APIGatewayEvent,
> extends BaseContentTypeHandler<
    AWSLambdaOptions<TRouter, TEvent> & {
      event: TEvent;
      req: HTTPRequest;
    }
  > {}

export const getLambdaHTTPJSONContentTypeHandler: <
  TRouter extends AnyRouter,
  TEvent extends APIGatewayEvent,
>() => LambdaHTTPContentTypeHandler<TRouter, TEvent> = () => {
  const rawInputCache = createConcurrentCache();
  const inputCache = createConcurrentCache();

  return {
    name: 'lambda-json',
    isMatch: (headers) => {
      return !!headers.get('content-type')?.startsWith('application/json');
    },
    getInputs: async (opts, info) => {
      function getRawProcedureInputOrThrow() {
        const { event, req } = opts;

        try {
          if (req.query.has('input')) {
            const input = req.query.get('input');
            if (!input) {
              return undefined;
            }

            return JSON.parse(input);
          }

          const body = lambdaEventToHTTPBody(opts.event);
          if (typeof body === 'string') {
            // A mutation with no inputs will have req.body === ''
            return body.length === 0 ? undefined : JSON.parse(body);
          }
          return event.body;
        } catch (cause) {
          throw new TRPCError({
            code: 'PARSE_ERROR',
            cause,
          });
        }
      }

      const deserializeInputValue = (
        rawValue: unknown,
        transformer: CombinedDataTransformer,
      ) => {
        return typeof rawValue !== 'undefined'
          ? transformer.input.deserialize(rawValue)
          : rawValue;
      };

      const rawInput = await rawInputCache.concurrentSafeGet('input', () =>
        getRawProcedureInputOrThrow(),
      );
      if (rawInput === undefined) {
        return undefined;
      }

      const transformer = opts.router._def._config.transformer;

      if (!info.isBatchCall) {
        return await inputCache.concurrentSafeGet('input', () =>
          deserializeInputValue(rawInput, transformer),
        );
      }

      /* istanbul ignore if  */
      if (
        rawInput == null ||
        typeof rawInput !== 'object' ||
        Array.isArray(rawInput)
      ) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: '"input" needs to be an object when doing a batch call',
        });
      }

      return await inputCache.concurrentSafeGet(String(info.batch), () =>
        deserializeInputValue(rawInput[info.batch], transformer),
      );
    },
  };
};
