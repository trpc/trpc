import { initTRPC } from '@trpc/core';

export const t = initTRPC.create();

export type Config = (typeof t)['_config'];
