import { api } from '~/trpc/server-invoker';
import { Suspense } from 'react';
import { ServerInvokedGreeting } from './ServerInvokedGreeting';

export const dynamic = 'force-dynamic';

async function AuthThing() {
  const me = await api.me.query();

  return <pre>Session: {JSON.stringify(me, null, 4)}</pre>;
}

export default async function Home() {
  return (
    <>
      <AuthThing />

      <div style={separator} />

      <div style={separator} />

      <div style={{ height: 160 }}>
        <Suspense fallback={<>Loading Server...</>}>
          <ServerInvokedGreeting />
        </Suspense>
      </div>

      <div style={separator} />
    </>
  );
}

const separator = {
  width: '50%',
  margin: '1rem 0',
  height: 2,
  background: 'hsla(210, 16%, 80%, 1)',
};
