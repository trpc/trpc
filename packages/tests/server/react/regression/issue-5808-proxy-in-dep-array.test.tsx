import { getServerAndReactClient } from '../__reactHelpers';
import { render, waitFor } from '@testing-library/react';
import { initTRPC } from '@trpc/server';
import { konn } from 'konn';
import * as React from 'react';

/**
 * For reference,
 * @link https://github.com/trpc/trpc/issues/4519
 */

const ctx = konn()
  .beforeEach(() => {
    const { router, procedure } = initTRPC.create();

    const appRouter = router({
      deeply: {
        nested: {
          greeting: procedure.query(() => 'hello'),
        },
      },
    });

    return getServerAndReactClient(appRouter);
  })
  .afterEach(async (ctx) => {
    await ctx?.close?.();
  })
  .done();

test('utils proxy in dependency array', async () => {
  const { client, App } = ctx;
  const nonce = '_______________nonce_______________';
  let effectCount = 0;

  function MyComponent() {
    const result = client.deeply.nested.greeting.useQuery(undefined);
    const utils = client.useUtils();

    React.useEffect(() => {
      utils.deeply.nested.greeting.setData(undefined, nonce);
      effectCount++;
    }, [utils.deeply.nested.greeting]);

    return <pre>{result.data}</pre>;
  }

  const utils = render(
    <App>
      <MyComponent />
    </App>,
  );

  await waitFor(() => {
    expect(utils.container).toHaveTextContent(nonce);
  });
  expect(effectCount).toBe(1);
});
