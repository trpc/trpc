import { TRPCApi, TRPCEndpoint, TRPCRouter } from './internal';

export { TRPCApi, TRPCRouter, TRPCEndpoint };
export const api = TRPCApi.create;
export const router = TRPCRouter.create;
export const endpoint = TRPCEndpoint.create;
