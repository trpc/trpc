import { api } from '~/trpc/server-http';
import Link from 'next/link';
import { Suspense } from 'react';
import { ServerHttpGreeting } from './ServerHttpGreeting';
import { ServerInvokedGreeting } from './ServerInvokedGreeting';

async function AuthThing() {
  const me = await api.me.query();

  return <pre>Session: {JSON.stringify(me, null, 4)}</pre>;
}

export default async function Home() {
  return (
    <>
      <AuthThing />

      <div
        style={{
          width: '50%',
          margin: '1rem 0',
          height: 2,
          background: 'hsla(210, 16%, 80%, 1)',
        }}
      />

      <div style={{ height: 100 }}>
        <Suspense fallback={<>Loading Server...</>}>
          <ServerHttpGreeting />
        </Suspense>
      </div>

      <div
        style={{
          width: '50%',
          margin: '1rem 0',
          height: 2,
          background: 'hsla(210, 16%, 80%, 1)',
        }}
      />

      <div style={{ height: 100 }}>
        <Suspense fallback={<>Loading Server...</>}>
          <ServerInvokedGreeting />
        </Suspense>
      </div>

      <div
        style={{
          width: '50%',
          margin: '1rem 0',
          height: 2,
          background: 'hsla(210, 16%, 80%, 1)',
        }}
      />
    </>
  );
}
