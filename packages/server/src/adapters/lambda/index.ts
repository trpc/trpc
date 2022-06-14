import {
  CreateAWSLambdaContextOptions,
  awsLambdaRequestHandler,
} from '../aws-lambda';
import { APIGatewayEvent } from '../aws-lambda/utils';

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
