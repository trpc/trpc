---
title: Streamed mutations
description: A mutation that returns an async iterable fills in as it streams, with `chunksOptions()`, and stops on unmount or on demand; long jobs pair a mutation with a subscription.
section: Integrations
parent: integrations/tanstack-query
order: 10
---

A mutation that returns an async iterable (an AI reply, say) can fill in as it streams:

```ts twoslash
// ---cut-start---
import { useMutation, useQuery } from '@tanstack/react-query';
import { createTrpcQueryUtils } from '@trpc12/tanstack-query';
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import { z } from 'zod';
import { t } from './server.ts';
const router = t.router({
  chat: {
    send: t.procedure
      .input(z.object({ text: z.string() }))
      .mutation(async function* () {
        yield 'ok';
        yield 'hi';
      }),
  },
});
const trpc = createTrpcQueryUtils({
  client: createTrpcClient({
    router: routerType<typeof router>(),
    links: [httpLink({ url: '/trpc' })],
  }),
});
declare const text: string;
// ---cut-end---
const send = useMutation(trpc.chat.send.streamedMutationOptions());
const chunks = useQuery(trpc.chat.send.chunksOptions());

send.mutate({ text });
// chunks.data: ['ok'] → ['ok', 'hi'], then send.data is ['ok', 'hi']
```

`chunksOptions()` never fetches; it reads what the mutation writes to `streamedMutationKey()`. Each `mutate` starts the chunks over. Pass `onChunk(chunk, chunks)` to act on each one.

## Stopping the stream

Resetting the mutation doesn't stop the stream on the server. Two options do, and in both `data` is the chunks so far:

```ts twoslash
// ---cut-start---
import { useRef } from 'react';
import { createTrpcQueryUtils } from '@trpc12/tanstack-query';
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import { z } from 'zod';
import { t } from './server.ts';
const router = t.router({
  chat: {
    send: t.procedure
      .input(z.object({ text: z.string() }))
      .mutation(async function* () {
        yield 'ok';
      }),
  },
});
const trpc = createTrpcQueryUtils({
  client: createTrpcClient({
    router: routerType<typeof router>(),
    links: [httpLink({ url: '/trpc' })],
  }),
});
// ---cut-end---
// stop when the last chunksOptions() reader unmounts
trpc.chat.send.streamedMutationOptions({ abortWhenUnobserved: true });

// stop on demand: a function gives each mutate() its own signal
const stop = useRef<AbortController>(undefined);
trpc.chat.send.streamedMutationOptions({
  signal: () => (stop.current = new AbortController()).signal,
});
stop.current?.abort();
```

## Long jobs

A stream tied to one screen fits a streamed mutation. A job that should outlive the screen, be resumed after a reload, or be watched from several tabs fits a mutation that starts it, a `tracked()` subscription for its progress, and a mutation that cancels it:

```ts twoslash
// ---cut-start---
import { skipToken, useMutation } from '@tanstack/react-query';
import {
  createTrpcQueryUtils,
  useSubscription,
} from '@trpc12/tanstack-react-query';
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import { tracked } from '@trpc12/trpc/server';
import { z } from 'zod';
import { t } from './server.ts';
const Params = z.object({ size: z.number() });
interface Step {
  id: string;
  done: number;
}
declare const jobs: {
  start(params: z.infer<typeof Params>): Promise<{ id: string }>;
  watch(id: string, opts: { after?: string }): AsyncIterable<Step>;
  cancel(id: string): Promise<void>;
};
// ---cut-end---
const job = {
  start: t.procedure.input(Params).mutation((opts) => jobs.start(opts.input)), // { id }
  progress: t.procedure
    .input(z.object({ id: z.string() }))
    .subscription(async function* (opts) {
      const steps = jobs.watch(opts.input.id, { after: opts.lastEventId });
      for await (const step of steps) yield tracked(step.id, step);
    }),
  cancel: t.procedure
    .input(z.object({ id: z.string() }))
    .mutation((opts) => jobs.cancel(opts.input.id)),
};
// ---cut-start---
const trpc = createTrpcQueryUtils({
  client: createTrpcClient({
    router: routerType<{ job: typeof job }>(),
    links: [httpLink({ url: '/trpc' })],
  }),
});
// ---cut-end---

const start = useMutation(trpc.job.start.mutationOptions());
const progress = useSubscription(
  trpc.job.progress.subscriptionOptions({
    input: start.data ? { id: start.data.id } : skipToken,
  }),
);
```

Unsubscribing stops watching, not the job.
