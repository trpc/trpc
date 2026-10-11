/**
 * TS2742 portability for `@trpcdev/tanstack-query` and every adapter: the
 * exported helpers and contexts must be nameable in emitted `.d.ts` files.
 */
import { createTRPCContext as createAngularContext } from '@trpcdev/tanstack-query/angular';
import {
  createTRPCQueryUtils,
  hydrationOptions,
  SubscriptionObserver,
} from '@trpcdev/tanstack-query';
import { createTRPCContext as createLitContext } from '@trpcdev/tanstack-query/lit';
import { createTRPCContext as createPreactContext } from '@trpcdev/tanstack-query/preact';
import { createTRPCContext as createReactContext } from '@trpcdev/tanstack-query/react';
import { createTRPCContext as createSolidContext } from '@trpcdev/tanstack-query/solid';
import { createTRPCContext as createSvelteContext } from '@trpcdev/tanstack-query/svelte';
import { createTRPCContext as createVueContext } from '@trpcdev/tanstack-query/vue';
import { caller, typedClient, type AppRouter } from './index.ts';

export const trpc = createTRPCQueryUtils({ client: typedClient });
export const serverTRPC = createTRPCQueryUtils({ client: caller });

export const postQuery = trpc.byId.queryOptions({
  input: { id: '1' },
  context: { traceId: 'abc' },
});
export const postKey = trpc.byId.queryKey({ input: { id: '1' } });
export const postFilter = trpc.byId.queryFilter();
export const postsInfinite = trpc.byId.infiniteOptions({
  input: (cursor: string | undefined) => ({ id: cursor ?? '1' }),
  initialPageParam: undefined,
  getNextPageParam: () => undefined,
});
export const createPost = trpc.create.mutationOptions();
export const feed = trpc.feed.queryOptions();
export const onPost = trpc.onPost.subscriptionOptions();
export const ticksLive = trpc.ticks.liveOptions();
export const ticksStreamed = trpc.ticks.streamedOptions({ maxChunks: 2 });
export const rootKey = trpc.pathKey();
export const ticksObserver = new SubscriptionObserver(
  trpc.ticks.subscriptionOptions(),
);
export const hydration = hydrationOptions();

export const reactTRPC = createReactContext<AppRouter>();
export const preactTRPC = createPreactContext<AppRouter>();
export const vueTRPC = createVueContext<AppRouter>();
export const solidTRPC = createSolidContext<AppRouter>();
export const svelteTRPC = createSvelteContext<AppRouter>();
export const angularTRPC = createAngularContext<AppRouter>();
export const litTRPC = createLitContext<AppRouter>();
