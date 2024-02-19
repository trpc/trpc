'use client';

import { standaloneClient } from './_provider';

export default function Page() {
  const client = standaloneClient.useClient();

  client.greeting.query({
    text: 'hello world',
  });
  return <></>;
}
