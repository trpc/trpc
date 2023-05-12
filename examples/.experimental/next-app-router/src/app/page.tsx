import { Suspense } from 'react';
import { api } from 'trpc-api';
import { ClientGreeting } from './ClientGreeting';
import { ServerGreeting } from './ServerGreeting';

export default async function Home() {
  const promise = new Promise(async (resolve) => {
    await new Promise((r) => setTimeout(r, 1000)); // wait for demo purposes
    resolve(api.greeting.query({ text: 'streamed server data' }));
  });

  return (
    <main
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        fontSize: '1.1rem',
      }}
    >
      <div
        style={{
          width: '12rem',
          padding: '1rem',
          background: '#e5e5e5',
          borderRadius: '0.5rem',
        }}
      >
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
      </div>
    </main>
  );
}

async function StreamedSC(props: { promise: Promise<string> }) {
  const data = await props.promise;

  return <div>{data}</div>;
}
