/** Runs both apps against the server at `url`. */
import { deepStrictEqual } from 'node:assert/strict';
import { run as billingWidget } from '@acme/billing-widget';
import { run as web } from '@acme/web';

export async function main(url: string) {
  const fromWeb = await web(url);
  console.log('web:', fromWeb);
  deepStrictEqual(fromWeb, {
    post: 'Hello v12',
    createdBy: 'ada',
    me: 'Ada Lovelace',
    missing: '404',
  });

  const fromWidget = await billingWidget(url);
  console.log('billing-widget:', fromWidget);
  deepStrictEqual(fromWidget, { invoice: 'inv_1', paid: true });
}

if (import.meta.main)
  await main(process.argv[2] ?? 'http://localhost:3000/trpc');
