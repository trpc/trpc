import { gzipSync } from 'zlib';
import type {
  APIGatewayProxyEvent,
  APIGatewayProxyEventV2,
  APIGatewayProxyResult,
  APIGatewayProxyStructuredResultV2,
  Context as APIGWContext,
} from 'aws-lambda';
import { TRPCError } from '../..';
import { AnyRouter, inferRouterContext } from '../../core';
import { HTTPRequest, resolveHTTPResponse } from '../../http';
import { HTTPResponse } from '../../http/internals/types';
import {
  APIGatewayEvent,
  APIGatewayResult,
  AWSLambdaOptions,
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

interface MinimalAPIGatewayResult {
  isBase64Encoded?: boolean;
  body?: string;
  headers?: Record<string, string | number | boolean>;
}

function acceptsGzipEncoding(acceptsEncoding?: string | number | boolean) {
  if (!acceptsEncoding) {
    return false;
  }

  return (
    String(acceptsEncoding).trim() === '*' ||
    String(acceptsEncoding).toLowerCase().includes('gzip')
  );
}

// TODO: the thing is, gzip could be in the header but explicitly disabled like with "gzip;q=0"
// There's also not much reason not to support other formats, br,deflate etc beyond laziness
// ALSO we probably don't have to configure this in tRPC< we could just honour what the Accept-Encoding header tells us in general
function maybeGzipBody(
  event: APIGatewayEvent,
  resp: MinimalAPIGatewayResult,
  gzipping?: AWSLambdaOptions<any, any>['gzipping'],
) {
  if (
    gzipping?.enabled &&
    resp.body &&
    acceptsGzipEncoding(event.headers['Accept-Encoding'])
  ) {
    const threshold = gzipping.thresholdBytes ?? 0;

    if (resp.body.length >= threshold) {
      resp.isBase64Encoded = true;
      resp.body = gzipSync(resp.body).toString('base64');

      resp.headers ??= {};
      resp.headers['Content-Encoding'] = 'gzip';
    }
  }
}

function tRPCOutputToAPIGatewayOutput<
  TRouter extends AnyRouter,
  TEvent extends APIGatewayEvent,
  TResult extends APIGatewayResult,
>(
  event: TEvent,
  response: HTTPResponse,
  opts: AWSLambdaOptions<TRouter, TEvent>,
): TResult {
  if (isPayloadV1(event)) {
    const resp: APIGatewayProxyResult = {
      statusCode: response.status,
      body: response.body ?? '',
      headers: transformHeaders(response.headers ?? {}),
    };

    maybeGzipBody(event, resp, opts.gzipping);

    return resp as TResult;
  } else if (isPayloadV2(event)) {
    const resp: APIGatewayProxyStructuredResultV2 = {
      statusCode: response.status,
      body: response.body ?? undefined,
      headers: transformHeaders(response.headers ?? {}),
    };

    maybeGzipBody(event, resp, opts.gzipping);

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

    return tRPCOutputToAPIGatewayOutput<TRouter, TEvent, TResult>(
      event,
      response,
      opts,
    );
  };
}
