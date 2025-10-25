import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { createTRPCClient } from '@trpc/client';
import { httpBatchLink } from '@trpc/client/links/httpBatchLink';
import { initTRPC } from '@trpc/server';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import * as React from 'react';
import { useState } from 'react';
import { expect, test, vi } from 'vitest';

test('multiple query keys', async () => {
  const billingT = initTRPC.create();
  const accountT = initTRPC.create();

  await using billingCtx = testServerAndClientResource(
    billingT.router({
      list: billingT.procedure.query(() => ['invoice 1']),
    }),
  );
  await using accountCtx = testServerAndClientResource(
    accountT.router({
      list: accountT.procedure.query(() => ['account 1']),
    }),
  );

  const billing = createTRPCContext<
    typeof billingCtx.router,
    { keyPrefix: true }
  >();
  const BillingTRPCProvider = billing.TRPCProvider;
  const useBilling = billing.useTRPC;

  const account = createTRPCContext<
    typeof accountCtx.router,
    { keyPrefix: true }
  >();
  const AccountTRPCProvider = account.TRPCProvider;
  const useAccount = account.useTRPC;

  const queryClient = new QueryClient();
  function App() {
    const [billingClient] = useState(() =>
      createTRPCClient<typeof billingCtx.router>({
        links: [httpBatchLink({ url: billingCtx.httpUrl })],
      }),
    );
    const [accountClient] = useState(() =>
      createTRPCClient<typeof accountCtx.router>({
        links: [httpBatchLink({ url: accountCtx.httpUrl })],
      }),
    );

    return (
      <QueryClientProvider client={queryClient}>
        <BillingTRPCProvider
          trpcClient={billingClient}
          queryClient={queryClient}
          keyPrefix="billing"
        >
          <AccountTRPCProvider
            trpcClient={accountClient}
            queryClient={queryClient}
            keyPrefix="account"
          >
            <MyComponent />
          </AccountTRPCProvider>
        </BillingTRPCProvider>
      </QueryClientProvider>
    );
  }

  function MyComponent() {
    const billing = useBilling();
    const account = useAccount();

    const billingList = useQuery(billing.list.queryOptions());
    const accountList = useQuery(account.list.queryOptions());

    return (
      <div>
        <div>Billing: {billingList.data?.join(', ')}</div>
        <div>Account: {accountList.data?.join(', ')}</div>
      </div>
    );
  }

  const utils = render(<App />);

  await vi.waitFor(() => {
    expect(utils.container).toHaveTextContent('Billing: invoice 1');
    expect(utils.container).toHaveTextContent('Account: account 1');
  });

  expect(
    queryClient
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey),
  ).toMatchInlineSnapshot(`
    Array [
      Array [
        Array [
          "billing",
        ],
        Array [
          "list",
        ],
        Object {
          "type": "query",
        },
      ],
      Array [
        Array [
          "account",
        ],
        Array [
          "list",
        ],
        Object {
          "type": "query",
        },
      ],
    ]
  `);
});
