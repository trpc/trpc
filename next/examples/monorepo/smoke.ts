/**
 * Starts the server and runs both apps against it. `pnpm smoke` builds
 * every package's declarations with `tsc -b` first.
 */
import { deepStrictEqual } from 'node:assert/strict';
import { run as billingWidget } from '@acme/billing-widget';
import { startServer } from '@acme/server';
import { run as web } from '@acme/web';

const server = await startServer(0);
try {
  const fromWeb = await web(server.url);
  console.log('web:', fromWeb);
  deepStrictEqual(fromWeb, {
    post: 'Hello v12',
    createdBy: 'ada',
    me: 'Ada Lovelace',
    missing: '404',
  });

  const fromWidget = await billingWidget(server.url);
  console.log('billing-widget:', fromWidget);
  deepStrictEqual(fromWidget, { invoice: 'inv_1', paid: true });
} finally {
  await server.close();
}
