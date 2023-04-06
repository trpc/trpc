import { getServerAndReactClient } from '../__reactHelpers';
import { render } from '@testing-library/react';
import { createTRPCProxyClient } from '@trpc/client';
import { createProxySSGHelpers } from '@trpc/react-query/src/ssg';
import { IntersectionError } from '@trpc/server';
import { initTRPC } from '@trpc/server/src/core';
import { expectTypeOf } from 'expect-type';
import React from 'react';
import { z } from 'zod';

test('vanilla client', async () => {
  const t = initTRPC.create();

  const appRouter = t.router({
    links: t.procedure.query(() => 'hello'),
    a: t.procedure.query(() => 'a'),
  });

  const client = createTRPCProxyClient<typeof appRouter>({ links: [] });

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

  const { proxy, App } = getServerAndReactClient(appRouter);

  function MyComponent() {
    expectTypeOf(proxy).toMatchTypeOf<IntersectionError<'Provider'>>();

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

  const { proxy, App } = getServerAndReactClient(appRouter);

  function MyComponent() {
    const utils = proxy.useContext();

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

  const ssg = createProxySSGHelpers({ router: appRouter, ctx: {} });

  expectTypeOf(ssg).toEqualTypeOf<IntersectionError<'queryClient'>>();
});
