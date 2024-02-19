'use client';

import { use, useEffect, useState } from 'react';
import { standaloneClient } from './_provider';

export default function Page() {
  const client = standaloneClient.useClient();
  const [, forceRender] = useState(0);

  useEffect(() => {
    // force render every second
    const interval = setInterval(() => {
      console.log('force rendering the page');
      forceRender((c) => c + 1);
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  const data = use(
    client.greeting.query({
      text: 'standalone client',
    }),
  );
  return (
    <>
      <pre>{JSON.stringify(data, null, 4)}</pre>
    </>
  );
}
