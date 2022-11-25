import { appRouter } from '../__generated__/bigBoi/_app';
import { getServerAndReactClient } from './__reactHelpers';
import { render, waitFor } from '@testing-library/react';
import { expectTypeOf } from 'expect-type';
import { konn } from 'konn';
import React from 'react';

const ctx = konn()
  .beforeEach(() => {
    return getServerAndReactClient(appRouter);
  })
  .afterEach(async (ctx) => {
    await ctx?.close?.();
  })
  .done();

test('vanilla', async () => {
  const { opts } = ctx;
  const { proxy } = opts;

  {
    const result = await proxy.r0.greeting.query({ who: 'KATT' });

    expect(result).toBe('hello KATT');
    expectTypeOf(result).not.toBeAny();
    expectTypeOf(result).toMatchTypeOf<string>();
  }
  {
    const result = await proxy.r10.grandchild.grandChildMutation.mutate();
    expect(result).toBe('grandChildMutation');
  }

  {
    const result = await proxy.r499.greeting.query({ who: 'KATT' });

    expect(result).toBe('hello KATT');
    expectTypeOf(result).not.toBeAny();
    expectTypeOf(result).toMatchTypeOf<string>();
  }
});

test('useQuery()', async () => {
  const { proxy, App } = ctx;
  function MyComponent() {
    const query1 = proxy.r499.greeting.useQuery({ who: 'KATT' });

    if (!query1.data) {
      return <>...</>;
    }
    expectTypeOf(query1.data).not.toBeAny();
    expectTypeOf(query1.data).toMatchTypeOf<string>();
    return <pre>{JSON.stringify(query1.data ?? 'n/a', null, 4)}</pre>;
  }

  const utils = render(
    <App>
      <MyComponent />
    </App>,
  );
  await waitFor(() => {
    expect(utils.container).toHaveTextContent(`hello KATT`);
  });
});
