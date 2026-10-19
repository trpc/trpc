/**
 * TS2742 portability for `@trpc12/tanstack-query` and every adapter: the
 * exported helpers and contexts must be nameable in emitted `.d.ts` files.
 */
import { createTrpcContext as createAngularContext } from '@trpc12/experimental-tanstack-angular-query';
import {
  createTrpcQueryUtils,
  hydrationOptions,
  SubscriptionObserver,
} from '@trpc12/tanstack-query';
import { createTrpcContext as createLitContext } from '@trpc12/experimental-tanstack-lit-query';
import { createTrpcContext as createPreactContext } from '@trpc12/experimental-tanstack-preact-query';
import { createTrpcContext as createReactContext } from '@trpc12/tanstack-react-query';
import { createTrpcContext as createSolidContext } from '@trpc12/experimental-tanstack-solid-query';
import { createTrpcContext as createSvelteContext } from '@trpc12/experimental-tanstack-svelte-query';
import { createTrpcContext as createVueContext } from '@trpc12/experimental-tanstack-vue-query';
import { caller, typedClient, type AppRouter } from './index.ts';

export const trpc = createTrpcQueryUtils({ client: typedClient });
export const serverTrpc = createTrpcQueryUtils({ client: caller });

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

export const reactTrpc = createReactContext<AppRouter>();
export const preactTrpc = createPreactContext<AppRouter>();
export const vueTrpc = createVueContext<AppRouter>();
export const solidTrpc = createSolidContext<AppRouter>();
export const svelteTrpc = createSvelteContext<AppRouter>();
export const angularTrpc = createAngularContext<AppRouter>();
export const litTrpc = createLitContext<AppRouter>();
