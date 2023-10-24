import { Writable } from 'stream';
import type {
  APIGatewayProxyEvent,
  APIGatewayProxyEventV2,
  APIGatewayProxyResult,
  APIGatewayProxyStructuredResultV2,
  Context as APIGWContext,
} from 'aws-lambda';
import { Context, Handler } from 'aws-lambda';
import { TRPCError } from '../..';
import { AnyRouter, inferRouterContext } from '../../core';
import {
  getBatchStreamFormatter,
  HTTPRequest,
  resolveHTTPResponse,
} from '../../http';
import { HTTPResponse, ResponseChunk } from '../../http/internals/types';
// import { awslambda } from './awslambda';
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

// FIXME: would love to put this into a declaration file but rollup rejects every approach that's been tried
// eslint-disable-next-line @typescript-eslint/no-namespace
declare namespace awslambda {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  export namespace HttpResponseStream {
    function from(writable: Writable, metadata: any): Writable;
  }

  export interface ResponseStreamWritable extends Writable {
    setContentType(contentType: string): void;

    setIsBase64Encoded(isBase64Encoded: boolean): void;
  }

  export type StreamifyHandler<TEvent> = (
    event: TEvent,
    responseStream: ResponseStreamWritable,
    context: Context,
  ) => Promise<void>;

  export function streamifyResponse<TEvent = any, TResult = any>(
    handler: StreamifyHandler<TEvent>,
  ): Handler<TEvent, TResult>;
}

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

export function awsLambdaStreamingRequestHandlerInner<
  TRouter extends AnyRouter,
  TEvent extends APIGatewayEvent,
>(opts: AWSLambdaOptions<TRouter, TEvent>): awslambda.StreamifyHandler<TEvent> {
  return async (event, response, context) => {
    const req = lambdaEventToHTTPRequest(event);
    const path = getPath(event);
    const createContext = async function _createContext(): Promise<
      inferRouterContext<TRouter>
    > {
      return await opts.createContext?.({ event, context });
    };

    let formatter: ReturnType<typeof getBatchStreamFormatter>;
    const unstable_onHead = (_head: HTTPResponse, isStreaming: boolean) => {
      response.setContentType('application/json');

      // TODO: was this important?
      // if (
      //   'status' in head &&
      //   (!opts.res.statusCode || opts.res.statusCode === 200)
      // ) {
      //   opts.res.statusCode = head.status;
      // }

      // TODO: lambda should set all the streaming headers okay,
      //   and content-type is exposed, but arbitrary headers are not
      // for (const [key, value] of Object.entries(head.headers ?? {})) {
      //   /* istanbul ignore if -- @preserve */
      //   if (typeof value === 'undefined') {
      //     continue;
      //   }
      //   opts.res.setHeader(key, value);
      // }

      if (isStreaming) {
        // opts.res.setHeader('Transfer-Encoding', 'chunked');
        // const vary = opts.res.getHeader('Vary');
        // opts.res.setHeader(
        //   'Vary',
        //   vary ? 'trpc-batch-mode, ' + vary : 'trpc-batch-mode',
        // );

        formatter = getBatchStreamFormatter();
        // opts.res.flushHeaders();
      }
    };

    const unstable_onChunk = ([index, string]: ResponseChunk) => {
      if (index === -1) {
        /**
         * Full response, no streaming. This can happen
         * - if the response is an error
         * - if response is empty (HEAD request)
         */
        response.end(string);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        response.write(formatter!(index, string));

        // Probably not needed as aws-lambda will do this for us
        // response.flush?.();
      }
    };

    await resolveHTTPResponse({
      batching: opts.batching,
      responseMeta: opts.responseMeta,
      path: path,
      createContext,
      router: opts.router,
      req,
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

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    response.write(formatter!.end());
    response.end();
  };
}

export function awsLambdaStreamingRequestHandler<
  TRouter extends AnyRouter,
  TEvent extends APIGatewayEvent,
  TResult extends inferAPIGWReturn<TEvent>,
>(opts: AWSLambdaOptions<TRouter, TEvent>) {
  return awslambda.streamifyResponse<TEvent, TResult>(
    awsLambdaStreamingRequestHandlerInner<TRouter, TEvent>(opts),
  );
}
