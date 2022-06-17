import { Context } from './context';
import { initTRPC } from '@trpc/server';

export const t = initTRPC<{
  ctx: Context;
}>()();
