/**
 * If you're making an adapter for tRPC and looking at this file for reference, you should import types and functions from `@trpc/server` and `@trpc/server/http`
 *
 * @example
 * ```ts
 * import type { AnyTRPCRouter } from '@trpc/server'
 * import type { HTTPBaseHandlerOptions } from '@trpc/server/http'
 * ```
 */
import type {
  APIGatewayProxyEvent,
  APIGatewayProxyEventV2,
  APIGatewayProxyResult,
  APIGatewayProxyStructuredResultV2,
  Context as APIGWContext,
} from 'aws-lambda';
// @trpc/server
import type { AnyRouter } from '../../@trpc/server';
// @trpc/server
import { TRPCError } from '../../@trpc/server';
import type { ResolveHTTPRequestOptionsContextFn } from '../../@trpc/server/http';
import { resolveResponse } from '../../@trpc/server/http';
import type {
  APIGatewayEvent,
  APIGatewayResult,
  AWSLambdaOptions,
} from './utils';
import {
  getHTTPMethod,
  getPath,
  getURLFromEvent,
  isPayloadV1,
  isPayloadV2,
  transformHeaders,
  UNKNOWN_PAYLOAD_FORMAT_VERSION_ERROR_MESSAGE,
} from './utils';

export * from './utils';

function lambdaEventToRequest(event: APIGatewayEvent): Request {
  let body: string | null | undefined;
  if (event.body && event.isBase64Encoded) {
    body = Buffer.from(event.body, 'base64').toString('utf8');
  } else {
    body = event.body;
  }

  const url = getURLFromEvent(event);

  const method = getHTTPMethod(event);

  const init: RequestInit = {
    headers: event.headers as any,
    method,
    // @ts-expect-error this is fine
    duplex: 'half',
  };
  if (method === 'POST') {
    init.body = body;
  }

  const request = new Request(url, init);

  return request;
}

async function tRPCOutputToAPIGatewayOutput<
  TEvent extends APIGatewayEvent,
  TResult extends APIGatewayResult,
>(event: TEvent, response: Response): Promise<TResult> {
  if (isPayloadV1(event)) {
    const result: APIGatewayProxyResult = {
      statusCode: response.status,
      body: await response.text(),
      headers: transformHeaders(response.headers),
    };

    return result as TResult;
  } else if (isPayloadV2(event)) {
    const resp: APIGatewayProxyStructuredResultV2 = {
      statusCode: response.status,
      body: await response.text(),
      headers: transformHeaders(response.headers),
    };

    return resp as TResult;
  } else {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: UNKNOWN_PAYLOAD_FORMAT_VERSION_ERROR_MESSAGE,
    });
  }
}

/** 1:1 mapping of v1 or v2 input events, deduces which is which.
 * @internal
 **/
type inferAPIGWReturn<TType> = TType extends APIGatewayProxyEvent
  ? APIGatewayProxyResult
  : TType extends APIGatewayProxyEventV2
  ? APIGatewayProxyStructuredResultV2
  : never;
export function awsLambdaRequestHandler<
  TRouter extends AnyRouter,
  TEvent extends APIGatewayEvent,
  TResult extends inferAPIGWReturn<TEvent>,
>(
  opts: AWSLambdaOptions<TRouter, TEvent>,
): (event: TEvent, context: APIGWContext) => Promise<TResult> {
  return async (event, context) => {
    const req = lambdaEventToRequest(event);

    const path = getPath(event);

    const createContext: ResolveHTTPRequestOptionsContextFn<TRouter> = async (
      innerOpts,
    ) => {
      return await opts.createContext?.({ event, context, ...innerOpts });
    };

    const response = await resolveResponse({
      ...opts,
      createContext,
      req,
      path,
      error: null,
      onError(o) {
        opts?.onError?.({
          ...o,
          req: event,
        });
      },
    });

    return await tRPCOutputToAPIGatewayOutput<TEvent, TResult>(event, response);
  };
}
