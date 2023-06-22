import { Suspense } from 'react';
import { ServerHttpGreeting } from './ServerHttpGreeting';
import { ServerInvokedGreeting } from './ServerInvokedGreeting';

export default async function Home() {
  return (
    <>
      <div>
        <Suspense fallback={<>Loading Server...</>}>
          <ServerHttpGreeting />
        </Suspense>
      </div>

      <div
        style={{
          width: '30%',
          margin: '1rem 0',
          height: 2,
          background: 'hsla(210, 16%, 80%, 1)',
        }}
      />

      {/* <div>
        <Suspense fallback={<>Loading Server...</>}>
          <ServerInvokedGreeting />
        </Suspense>
      </div> */}
    </>
  );
}
