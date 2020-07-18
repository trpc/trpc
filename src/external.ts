import { ZodRPCApi, ZodRPCEndpoint, ZodRPCRouter } from './internal';

export const zodrpc = {
  api: ZodRPCApi.create,
  router: ZodRPCRouter.create,
  endpoint: ZodRPCEndpoint.create,
};
