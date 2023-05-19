import { Suspense } from 'react';
import { api } from 'trpc-api';
import { TestMutation } from '../TestMutation';
import { ClientGreeting } from './ClientGreeting';
import { ServerGreeting } from './ServerGreeting';

export default async function Home() {
  const promise = new Promise(async (resolve) => {
    await new Promise((r) => setTimeout(r, 1000)); // wait for demo purposes
    resolve(api.greeting.query({ text: 'streamed server data' }));
  });

  return (
    <>
      <div>
        <Suspense fallback={<>Loading client...</>}>
          <ClientGreeting />
        </Suspense>
      </div>

      <div>
        <Suspense fallback={<>Loading Server...</>}>
          {/* @ts-expect-error RSC + TS not friends yet */}
          <ServerGreeting />
        </Suspense>
      </div>
      <div>
        <Suspense fallback={<>Loading stream...</>}>
          {/** @ts-expect-error - Async Server Component */}
          <StreamedSC promise={promise} />
        </Suspense>
      </div>
    </>
  );
}

async function StreamedSC(props: { promise: Promise<string> }) {
  const data = await props.promise;

  return <div>{data}</div>;
}
