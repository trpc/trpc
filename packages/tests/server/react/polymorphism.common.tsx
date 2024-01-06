import { initTRPC } from '@trpc/server';

export const t = initTRPC.create();

export type Config = (typeof t)['_config'];
