import { createProxySSGHelpers } from '@trpc/react-query/ssg';
import SuperJSON from 'superjson';
import { CreateInnerContextOptions, createInnerTRPCContext } from './context';
import { appRouter } from './routers/_app';

export const ssgInit = async (opts?: CreateInnerContextOptions) =>
  createProxySSGHelpers({
    router: appRouter,
    transformer: SuperJSON,
    ctx: await createInnerTRPCContext(opts),
  });
