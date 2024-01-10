import type { CreateAWSLambdaContextOptions } from '../aws-lambda';
import { awsLambdaRequestHandler } from '../aws-lambda';
import type { APIGatewayEvent } from '../aws-lambda/utils';

export * from '../aws-lambda';

/**
 * @deprecated use `aws-lambda` instead
 */
export type CreateLambdaContextOptions<TEvent extends APIGatewayEvent> =
  CreateAWSLambdaContextOptions<TEvent>;

/**
 * @deprecated use `aws-lambda` instead
 */
export const lambdaRequestHandler = awsLambdaRequestHandler;
