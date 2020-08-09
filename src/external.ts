import { TRPCApi, TRPCEndpoint, TRPCRouter, TRPCError, TRPCErrorCode } from './internal';

export { TRPCApi, TRPCRouter, TRPCEndpoint, TRPCError, TRPCErrorCode };
export const api = TRPCApi.create;
export const router = TRPCRouter.create;
export const endpoint = TRPCEndpoint.create;
