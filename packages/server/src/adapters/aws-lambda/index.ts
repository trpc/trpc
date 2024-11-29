/* eslint-disable @typescript-eslint/no-non-null-assertion */
import type {
  APIGatewayProxyEvent,
  APIGatewayProxyEventV2,
  APIGatewayProxyResult,
  APIGatewayProxyStructuredResultV2,
  Context as APIGWContext,
} from 'aws-lambda';
import { TRPCError } from '../..';
import type { AnyRouter, inferRouterContext } from '../../core';
import type { HTTPRequest } from '../../http';
import { resolveHTTPResponse, getBatchStreamFormatter } from '../../http';
import type { HTTPResponse, ResponseChunk } from '../../http/internals/types';
import type {
  APIGatewayEvent,
  APIGatewayResult,
  AWSLambdaOptions,
} from './utils';
import {
  getHTTPMethod,
  getPath,
  isPayloadV1,
  isPayloadV2,
  transformHeaders,
  UNKNOWN_PAYLOAD_FORMAT_VERSION_ERROR_MESSAGE,
} from './utils';

export * from './utils';

function lambdaEventToHTTPRequest(event: APIGatewayEvent): HTTPRequest {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(
    event.queryStringParameters ?? {},
  )) {
    if (typeof value !== 'undefined') {
      query.append(key, value);
    }
  }

  let body: string | null | undefined;
  if (event.body && event.isBase64Encoded) {
    body = Buffer.from(event.body, 'base64').toString('utf8');
  } else {
    body = event.body;
  }

  return {
    method: getHTTPMethod(event),
    query: query,
    headers: event.headers,
    body: body,
  };
}

function tRPCOutputToAPIGatewayOutput<
  TEvent extends APIGatewayEvent,
  TResult extends APIGatewayResult,
>(event: TEvent, response: HTTPResponse): TResult {
  if (isPayloadV1(event)) {
    const resp: APIGatewayProxyResult = {
      statusCode: response.status,
      body: response.body ?? '',
      headers: transformHeaders(response.headers ?? {}),
    };
    return resp as TResult;
  } else if (isPayloadV2(event)) {
    const resp: APIGatewayProxyStructuredResultV2 = {
      statusCode: response.status,
      body: response.body ?? undefined,
      headers: transformHeaders(response.headers ?? {}),
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
    const req = lambdaEventToHTTPRequest(event);
    const path = getPath(event);
    const createContext = async function _createContext(): Promise<
      inferRouterContext<TRouter>
    > {
      return await opts.createContext?.({ event, context });
    };

    const response = await resolveHTTPResponse({
      router: opts.router,
      batching: opts.batching,
      responseMeta: opts?.responseMeta,
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

    return tRPCOutputToAPIGatewayOutput<TEvent, TResult>(event, response);
  };
}

export function awsLambdaStreamingRequestHandler<
  TRouter extends AnyRouter,
  TEvent extends APIGatewayEvent,
>(
  opts: AWSLambdaOptions<TRouter, TEvent>,
): (event: TEvent, responseStream: awslambda.ResponseStream, context: APIGWContext) => Promise<void> {
  return async (event, responseStream, context) => {
    const req = lambdaEventToHTTPRequest(event);
    const path = getPath(event);
    const createContext = async function _createContext(): Promise<
      inferRouterContext<TRouter>
    > {
      return await opts.createContext?.({ event, context });
    };

    let isStream = false;
    let formatter: ReturnType<typeof getBatchStreamFormatter>;

    const unstable_onHead = (head: HTTPResponse, isStreaming: boolean) => {
      const metadata = {
        statusCode: 200,
        headers: {} as APIGatewayResult['headers'],
      }

      const headers = transformHeaders(head.headers ?? {});
      if (!headers) throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to transform headers',
      });

      if (isStreaming) {
        headers['Transfer-Encoding'] = 'chunked';
        const vary = headers.Vary;
        headers.Vary = vary ? 'trpc-batch-mode, ' + vary : 'trpc-batch-mode';
        isStream = true;
        formatter = getBatchStreamFormatter();;
        responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
      }
    };

    const unstable_onChunk = ([index, string]: ResponseChunk) => {
      if (index === -1) {
        /**
         * Full response, no streaming. This can happen
         * - if the response is an error
         * - if response is empty (HEAD request)
         */
        responseStream.end(string);
      } else {
        responseStream.write(formatter(index, string));
      }
    };

    await resolveHTTPResponse({
      router: opts.router,
      batching: opts.batching,
      responseMeta: opts?.responseMeta,
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
      unstable_onHead,
      unstable_onChunk,
    });

    if (isStream) {
      responseStream.write(formatter!.end());
      responseStream.end();
      return;
    }
  };
}
