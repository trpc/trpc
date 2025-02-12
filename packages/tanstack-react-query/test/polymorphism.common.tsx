import { initTRPC } from '@trpc/server';

export const t = initTRPC.create();

export type $RootTypes = (typeof t)['_config']['$types'];
