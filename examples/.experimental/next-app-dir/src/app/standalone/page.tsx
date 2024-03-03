'use client';

import { Suspense, use, useEffect, useState } from 'react';
import { standaloneClient } from './_provider';

export default function Page() {
  const client = standaloneClient.useClient();
  const [, forceRender] = useState(0);

  // useEffect(() => {
  //   // force render every second
  //   const interval = setInterval(() => {
  //     console.log('force rendering the page');
  //     forceRender((c) => c + 1);
  //   }, 1000);

  //   return () => {
  //     clearInterval(interval);
  //   };
  // }, []);

  const promise = client.greeting.query(
    {
      text: 'standalone client',
    },
    {
      ignoreCache: true,
      // wohooo, type and typedoc is inferred from cacheLink
    },
  );
  return (
    <>
      <Suspense>
        <pre>{JSON.stringify(use(promise), null, 4)}</pre>
      </Suspense>
    </>
  );
}
