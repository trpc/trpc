import type {
  Context as APIGWContext,
  APIGatewayProxyEvent,
  APIGatewayProxyEventV2,
  APIGatewayProxyResult,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import type { ResponseMetaFn } from '../../http/internals/types';
import type { OnErrorFunction } from '../../internals/onErrorFunction';
import type { AnyRouter, inferRouterContext } from '../../router';

export type APIGatewayEvent = APIGatewayProxyEvent | APIGatewayProxyEventV2;
export type APIGatewayResult =
  | APIGatewayProxyResult
  | APIGatewayProxyStructuredResultV2;

export type CreateAWSLambdaContextOptions<T extends APIGatewayEvent> = {
  event: T;
  context: APIGWContext;
};
export type AWSLambdaCreateContextFn<
  TRouter extends AnyRouter,
  TEvent extends APIGatewayEvent,
> = ({
  event,
  context,
}: CreateAWSLambdaContextOptions<TEvent>) =>
  | inferRouterContext<TRouter>
  | Promise<inferRouterContext<TRouter>>;

export type AWSLambdaOptions<
  TRouter extends AnyRouter,
  TEvent extends APIGatewayEvent,
> =
  | {
      router: TRouter;
      batching?: {
        enabled: boolean;
      };
      onError?: OnErrorFunction<TRouter, TEvent>;
      responseMeta?: ResponseMetaFn<TRouter>;
    } & (
      | {
          /**
           * @link https://trpc.io/docs/context
           **/
          createContext: AWSLambdaCreateContextFn<TRouter, TEvent>;
        }
      | {
          /**
           * @link https://trpc.io/docs/context
           **/
          createContext?: AWSLambdaCreateContextFn<TRouter, TEvent>;
        }
    );

export function isPayloadV1(
  event: APIGatewayEvent,
): event is APIGatewayProxyEvent {
  return determinePayloadFormat(event) == '1.0';
}
export function isPayloadV2(
  event: APIGatewayEvent,
): event is APIGatewayProxyEventV2 {
  return determinePayloadFormat(event) == '2.0';
}

function determinePayloadFormat(
  event: APIGatewayEvent,
): APIGatewayPayloadFormatVersion {
  // https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html
  // According to AWS support, version is is extracted from the version property in the event.
  // If there is no version property, then the version is implied as 1.0
  const unknownEvent = event as { version?: string };
  if (typeof unknownEvent.version === 'undefined') {
    return '1.0';
  } else {
    if (['1.0', '2.0'].includes(unknownEvent.version)) {
      return unknownEvent.version as APIGatewayPayloadFormatVersion;
    } else {
      return 'custom';
    }
  }
}
export type DefinedAPIGatewayPayloadFormats = '1.0' | '2.0';
export type APIGatewayPayloadFormatVersion =
  | DefinedAPIGatewayPayloadFormats
  | 'custom';

export const UNKNOWN_PAYLOAD_FORMAT_VERSION_ERROR_MESSAGE =
  'Custom payload format version not handled by this adapter. Please use either 1.0 or 2.0. More information here' +
  'https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html';
