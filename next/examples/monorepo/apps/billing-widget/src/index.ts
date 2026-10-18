/**
 * An app that only needs billing. It is typed from the billing contract, so
 * it depends on no server package and type-checks none of the router.
 */
import { billingContract, type BillingContract } from '@acme/billing-contract';
import {
  createTrpcClient,
  httpLink,
  experimental_validationLink,
} from '@trpc12/trpc/client';

// The api mounts billing under `billing`.
const contract: { billing: BillingContract } = { billing: billingContract };

export async function run(url: string) {
  const client = createTrpcClient({
    router: contract,
    links: [
      experimental_validationLink({ contract }),
      httpLink({ url, headers: { authorization: 'ada' } }),
    ],
  });

  const [first] = await client.billing.invoices.query();
  const paid = await client.billing.pay.mutate({ id: first!.id });
  return { invoice: paid.id, paid: paid.paid };
}
