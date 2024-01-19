import { getServerAndReactClient } from '../__reactHelpers';
import { render } from '@testing-library/react';
import { createTRPCClient } from '@trpc/client';
import { createServerSideHelpers } from '@trpc/react-query/server';
import { initTRPC } from '@trpc/server';
import type { IntersectionError } from '@trpc/server/unstable-core-do-not-import';
import React from 'react';
import { z } from 'zod';

test('vanilla client', async () => {
  const t = initTRPC.create();

  const appRouter = t.router({
    links: t.procedure.query(() => 'hello'),
    a: t.procedure.query(() => 'a'),
  });

  const client = createTRPCClient<typeof appRouter>({ links: [] });

  expectTypeOf(client).toMatchTypeOf<IntersectionError<'links'>>();
});

test('utils client', async () => {
  const t = initTRPC.create();

  const appRouter = t.router({
    Provider: t.router({
      greeting: t.procedure
        .input(z.object({ text: z.string().optional() }))
        .query(({ input }) => `Hello ${input.text ?? 'world'}`),
    }),
    a: t.procedure.query(() => 'a'),
  });

  const { client, App } = getServerAndReactClient(appRouter);

  function MyComponent() {
    expectTypeOf(client).toMatchTypeOf<IntersectionError<'Provider'>>();

    return null;
  }

  render(
    <App>
      <MyComponent />
    </App>,
  );
});

test('utils client', async () => {
  const t = initTRPC.create();

  const appRouter = t.router({
    client: t.router({
      greeting: t.procedure
        .input(z.object({ text: z.string().optional() }))
        .query(({ input }) => `Hello ${input.text ?? 'world'}`),
    }),
  });

  const { client, App } = getServerAndReactClient(appRouter);

  function MyComponent() {
    const utils = client.useContext();

    expectTypeOf(utils).toEqualTypeOf<IntersectionError<'client'>>();

    return null;
  }

  render(
    <App>
      <MyComponent />
    </App>,
  );
});

test('ssg queryClient', async () => {
  const t = initTRPC.create();

  const appRouter = t.router({
    queryClient: t.router({
      greeting: t.procedure
        .input(z.object({ text: z.string().optional() }))
        .query(({ input }) => `Hello ${input.text ?? 'world'}`),
    }),
  });

  const ssg = createServerSideHelpers({ router: appRouter, ctx: {} });

  expectTypeOf(ssg).toEqualTypeOf<IntersectionError<'queryClient'>>();
});
