import { createTRPCReact } from '@trpc/react-query';
import type { TRPCRouter } from './router';

export const trpc = createTRPCReact<TRPCRouter>();

export const useTRPC = () => {
  return trpc.useUtils();
};
