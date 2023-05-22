import type {
  Context as APIGWContext,
  APIGatewayProxyEvent,
  APIGatewayProxyEventV2,
  APIGatewayProxyResult,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import { TRPCError } from '../..';
import { AnyRouter, inferRouterContext } from '../../core';
import { HTTPRequest, resolveHTTPResponse } from '../../http';
import { HTTPResponse, ResponseChunk } from '../../http/internals/types';
import {
  APIGatewayEvent,
  APIGatewayResult,
  AWSLambdaOptions,
  RESPONSE_ACCUMULATOR_FAILED_INITIALIZATION_ERROR_MESSAGE,
  UNKNOWN_PAYLOAD_FORMAT_VERSION_ERROR_MESSAGE,
  getHTTPMethod,
  getPath,
  isPayloadV1,
  isPayloadV2,
  transformHeaders,
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

    const resultIterator = resolveHTTPResponse({
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

    const response = await accumulateIteratorIntoResponseFormat(
      resultIterator as AsyncGenerator<
        ResponseChunk,
        ResponseChunk | undefined
      >,
    );
    return tRPCOutputToAPIGatewayOutput<TEvent, TResult>(event, response);
  };
}

/**
 * @internal
 *
 * @warning
 * the implementation below does not support streaming responses.
 * It will buffer the entire response in memory before returning it.
 *
 * For streaming support, see https://aws.amazon.com/blogs/compute/introducing-aws-lambda-response-streaming/,
 * and look at implementation in other adapters.
 */
export async function accumulateIteratorIntoResponseFormat(
  iterator: AsyncGenerator<
    ResponseChunk | HTTPResponse,
    ResponseChunk | undefined
  >,
) {
  const { value: responseInit, done: invalidInit } = await (
    iterator as AsyncGenerator<HTTPResponse, HTTPResponse | undefined>
  ).next();
  const { value: firstChunk, done: abort } = await (
    iterator as AsyncGenerator<ResponseChunk, ResponseChunk | undefined>
  ).next();

  if (invalidInit) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: RESPONSE_ACCUMULATOR_FAILED_INITIALIZATION_ERROR_MESSAGE,
    });
  }

  if (abort) {
    const response = {
      status: responseInit.status,
      headers: responseInit.headers,
      body: firstChunk?.[1],
    };
    return response;
  }

  const responseArray: string[] = [];
  responseArray[firstChunk[0]] = firstChunk[1];
  for await (const [index, data] of iterator as AsyncGenerator<
    ResponseChunk,
    ResponseChunk | undefined
  >) {
    responseArray[index] = data;
  }
  const response = {
    status: responseInit.status,
    headers: responseInit.headers,
    body: '[' + responseArray.join(',') + ']',
  };
  return response;
}
