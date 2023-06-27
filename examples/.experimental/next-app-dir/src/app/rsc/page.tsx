import { Suspense } from 'react';
import { api } from 'trpc-api';
import { ClientGreeting } from './ClientGreeting';
import { ServerGreeting } from './ServerGreeting';

export default async function Home() {
  const promise = new Promise<string>(async (resolve) => {
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
          <ServerGreeting />
        </Suspense>
      </div>
      <div>
        <Suspense fallback={<>Loading stream...</>}>
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
