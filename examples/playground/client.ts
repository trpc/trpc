import { trpc } from '../../src';

import type { RootRouter } from './server';

// pass in your router type
// as a generic parameter to trpc.sdk
const clientSDK = trpc.sdk<RootRouter>({
  url: 'http://localhost:2021/trpc',
  getContext: () => {
    return {};
  },
});

async function main() {
  const res = await clientSDK.hello('client');

  console.log('res:', await res.run());
}

main();
