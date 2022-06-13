import { APIGatewayEvent } from 'aws-lambda';
import {
  CreateAWSLambdaContextOptions,
  awsLambdaRequestHandler,
} from '../aws-lambda';

export * from '../aws-lambda';

/**
 * @deprecated use `aws-lambda` instead
 */
export type CreateLambdaContextOptions<T extends APIGatewayEvent> =
  CreateAWSLambdaContextOptions<T>;

/**
 * @deprecated use `aws-lambda` instead
 */
export const lambdaRequestHandler = awsLambdaRequestHandler;
