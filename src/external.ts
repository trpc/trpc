import { ZodRPCApi, ZodRPCEndpoint, ZodRPCRouter } from './internal';

export const api = ZodRPCApi.create;
export const router = ZodRPCRouter.create;
export const endpoint = ZodRPCEndpoint.create;

export { ZodRPCApi as Api, ZodRPCRouter as Router, ZodRPCEndpoint as Endpoint };
