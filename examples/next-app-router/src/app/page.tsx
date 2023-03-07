import { Suspense } from 'react';
import { api } from 'trpc-api';
import { Greeting } from './client-greeting';

export default async function Home() {
  const [result, result2] = await Promise.all([
    api.greeting.query({ text: 'from server' }),
    api.greeting.query({ text: 'from server2' }),
  ]);

  const promise = new Promise(async (res) => {
    await new Promise((r) => setTimeout(r, 1000)); // wait for demo purposes
    res(api.greeting.query({ text: 'streamed server data' }));
  });

  return (
    <main>
      <Suspense fallback={<>Loading client...</>}>
        <Greeting />
      </Suspense>
      <div>{result}</div>
      <div>{result2}</div>
      <Suspense fallback={<>Loading stream...</>}>
        {/** @ts-expect-error - Async Server Component */}
        <StreamedSC promise={promise} />
      </Suspense>
    </main>
  );
}

async function StreamedSC(props: { promise: Promise<string> }) {
  const data = await props.promise;

  return <div>{data}</div>;
}
