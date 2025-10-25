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

test('recipe: multiple trpc providers with query key prefixing', async () => {
  const t = initTRPC.create();

  await using billingCtx = testServerAndClientResource(
    t.router({
      list: t.procedure.query(() => ['invoice 1']),
    }),
  );
  type BillingRouter = typeof billingCtx.router;
  await using accountCtx = testServerAndClientResource(
    t.router({
      list: t.procedure.query(() => ['account 1']),
    }),
  );
  type AccountRouter = typeof accountCtx.router;

  const billing = createTRPCContext<BillingRouter, { keyPrefix: true }>();
  const BillingProvider = billing.TRPCProvider;
  const useBilling = billing.useTRPC;
  const createBillingClient = () =>
    createTRPCClient<BillingRouter>({
      links: [httpBatchLink({ url: billingCtx.httpUrl })],
    });

  const account = createTRPCContext<AccountRouter, { keyPrefix: true }>();
  const AccountProvider = account.TRPCProvider;
  const useAccount = account.useTRPC;
  const createAccountClient = () =>
    createTRPCClient<AccountRouter>({
      links: [httpBatchLink({ url: accountCtx.httpUrl })],
    });

  const queryClient = new QueryClient();
  function App() {
    const [billingClient] = useState(() => createBillingClient());
    const [accountClient] = useState(() => createAccountClient());

    return (
      <QueryClientProvider client={queryClient}>
        <BillingProvider
          trpcClient={billingClient}
          queryClient={queryClient}
          keyPrefix="billing"
        >
          <AccountProvider
            trpcClient={accountClient}
            queryClient={queryClient}
            keyPrefix="account"
          >
            <MyComponent />
          </AccountProvider>
        </BillingProvider>
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
