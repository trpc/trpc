import {
  awsLambdaRequestHandler,
  CreateAWSLambdaContextOptions,
} from '../aws-lambda';
import { APIGatewayEvent } from '../aws-lambda/utils';

export {
  isPayloadV1,
  isPayloadV2,
  getHTTPMethod,
  getPath,
  transformHeaders,
  UNKNOWN_PAYLOAD_FORMAT_VERSION_ERROR_MESSAGE,
  type DefinedAPIGatewayPayloadFormats,
  type APIGatewayPayloadFormatVersion,
  type APIGatewayEvent,
  type APIGatewayResult,
  type CreateAWSLambdaContextOptions,
  type AWSLambdaCreateContextFn,
  type AWSLambdaOptions,
  awsLambdaRequestHandler,
} from '../aws-lambda';

/**
 * @deprecated use `aws-lambda` instead
 */
export type CreateLambdaContextOptions<TEvent extends APIGatewayEvent> =
  CreateAWSLambdaContextOptions<TEvent>;

/**
 * @deprecated use `aws-lambda` instead
 */
export const lambdaRequestHandler = awsLambdaRequestHandler;
