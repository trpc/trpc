import { getServerAndReactClient } from '../react/__reactHelpers';
import { render, waitFor } from '@testing-library/react';
import { initTRPC } from '@trpc/server';
import { konn } from 'konn';
import React, { useEffect } from 'react';
import { z } from 'zod';

const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC.create();

    const appRouter = t.router({
      q: t.procedure.input(z.any()).query(() => {
        return 'hello' as const;
      }),
      m: t.procedure.input(z.any()).mutation(() => {
        return 'hello' as const;
      }),
    });

    return getServerAndReactClient(appRouter);
  })
  .afterEach(async (ctx) => {
    await ctx?.close?.();
  })
  .done();

test('with input', async () => {
  const { client, App, appRouter } = ctx;

  const caller = appRouter.createCaller({});
  expect(await caller.m()).toBe('hello');
  expect(await caller.q()).toBe('hello');

  const MyComponent = () => {
    const query = client.q.useQuery();
    const [suspensed] = client.q.useSuspenseQuery();
    const mut = client.m.useMutation();
    const trpcClient = client.useUtils().client;
    useEffect(() => {
      mut.mutate();

      trpcClient.m.mutate();
      trpcClient.q.query();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
      <>
        {query.data ?? 'no-query'}
        {suspensed ?? 'no-suspense'}
        {mut.data ?? 'no-mutation'}
      </>
    );
  };

  const utils = render(
    <App>
      <MyComponent />
    </App>,
  );

  await waitFor(() => {
    expect(utils.getByText('hello'.repeat(3))).toBeInTheDocument();
  });
});
