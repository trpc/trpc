import { TRPCEndpoint, TRPCRouter, TRPCError, TRPCErrorCode } from './internal';
import { makeSDK } from './types/sdk';

export { TRPCRouter, TRPCEndpoint, TRPCError, TRPCErrorCode };
export const router = TRPCRouter.create;
export const endpoint = TRPCEndpoint.create;
export const sdk = makeSDK;
