import { Suspense } from 'react';
import { api } from 'trpc-api';
import { ClientGreeting } from './ClientGreeting';
import { ServerHttpGreeting } from './ServerHttpGreeting';
import { ServerInvokedGreeting } from './ServerInvokedGreeting';

export default async function Home() {
  // const promise = new Promise(async (resolve) => {
  //   await new Promise((r) => setTimeout(r, 1000)); // wait for demo purposes
  //   resolve(api.greeting.query({ text: 'streamed server data' }));
  // });

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
          <ServerHttpGreeting />
        </Suspense>
      </div>
      {/* <div>
        <Suspense fallback={<>Loading stream...</>}>

          <StreamedSC promise={promise} />
        </Suspense>
      </div> */}
      <form
        action={async () => {
          'use server';
          api.greeting.revalidate();
        }}
      >
        <button type="submit">Revalidate Http Calls</button>
      </form>

      <div
        style={{
          width: '30%',
          margin: '1rem 0',
          height: 2,
          background: 'hsla(210, 16%, 80%, 1)',
        }}
      />

      <div>
        <Suspense fallback={<>Loading Server...</>}>
          {/* @ts-expect-error RSC + TS not friends yet */}
          <ServerInvokedGreeting />
        </Suspense>
      </div>
    </>
  );
}

async function StreamedSC(props: { promise: Promise<string> }) {
  const data = await props.promise;

  return <div>{data}</div>;
}
