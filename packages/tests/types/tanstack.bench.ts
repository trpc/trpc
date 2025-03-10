import { bench } from '@ark/attest';
import { QueryClient, useMutation, useQuery } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import { useState } from 'react';
import { z } from 'zod';

const t = initTRPC.create();

bench.baseline(() => {
  const router = t.router({
    baselineProc: t.procedure
      .input(z.object({ baselineId: z.string() }))
      .query(() => ({ baselineName: 'baseline' })),
  });

  const { useTRPC } = createTRPCContext<typeof router>();

  const queryClient = new QueryClient({});
  const [trpcClient] = useState(() =>
    createTRPCClient<typeof router>({
      links: [],
    }),
  );

  function Component() {
    const baselineTrpc = useTRPC();
    const baselineQuery = useQuery(
      baselineTrpc.baselineProc.queryOptions({ baselineId: 'baseline_id' }),
    );
  }
});

// based on https://trpc.io/docs/client/tanstack-react-query/setup
const appRouter = t.router({
  getUser: t.procedure
    .input(z.object({ id: z.string() }))
    .query(() => ({ name: 'foo' })),
  createUser: t.procedure
    .input(z.object({ name: z.string() }))
    .mutation(() => 'bar'),
});

bench('docs tanstack example', () => {
  const { useTRPC } = createTRPCContext<typeof appRouter>();

  function makeQueryClient() {
    return new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 60 * 1000,
        },
      },
    });
  }

  let browserQueryClient: QueryClient | undefined = undefined;
  function getQueryClient() {
    if (typeof window === 'undefined') {
      return makeQueryClient();
    } else {
      if (!browserQueryClient) browserQueryClient = makeQueryClient();
      return browserQueryClient;
    }
  }

  const queryClient = getQueryClient();
  const [trpcClient] = useState(() =>
    createTRPCClient<typeof appRouter>({
      links: [
        httpBatchLink({
          url: 'http://localhost:2022',
        }),
      ],
    }),
  );

  function UserList() {
    const trpc = useTRPC();
    const userQuery = useQuery(trpc.getUser.queryOptions({ id: 'id_bilbo' }));
    const userCreator = useMutation(trpc.createUser.mutationOptions());
    const onClick = () => userCreator.mutate({ name: 'Frodo' });
  }
  // this is still extremely reasonable, but is noticably higher
  // than some of the cases in client.bench.ts and routes.bench.ts
}).types([7181, 'instantiations']);
