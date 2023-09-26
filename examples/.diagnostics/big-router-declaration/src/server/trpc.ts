import { initTRPC } from '@trpc/server';
import { Context } from '~/server/context';

export const t = initTRPC.context<Context>().create();
