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
import { isObject, memoize } from '../../../../unstable-core-do-not-import';
import { createConcurrentCache } from '../../../content-handlers/concurrentCache';
import {
  lambdaEventToHTTPBody,
  type APIGatewayEvent,
  type AWSLambdaOptions,
} from '../../utils';

export type LambdaHTTPContentTypeHandler = BaseContentTypeHandler<
  AWSLambdaOptions<AnyRouter, APIGatewayEvent> & {
    event: APIGatewayEvent;
    req: HTTPRequest;
  }
>;

export const lambdaJsonContentTypeHandler: LambdaHTTPContentTypeHandler = {
  name: 'json',
  isMatch(headers) {
    return !!headers.get('content-type')?.startsWith('application/json');
  },
  getInputs(opts) {
    const getRawProcedureInputOrThrow = memoize(async () => {
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
    });

    const deserialize = (v: unknown) =>
      v !== undefined
        ? opts.router._def._config.transformer.input.deserialize(v)
        : v;

    return async (info) => {
      const rawInput = await getRawProcedureInputOrThrow();
      if (!info.isBatchCall || rawInput === undefined) {
        return deserialize(rawInput);
      }

      if (!isObject(rawInput)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: '"input" needs to be an object when doing a batch call',
        });
      }
      return deserialize(rawInput[info.batch]);
    };
  },
};
