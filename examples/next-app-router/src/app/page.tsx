import { Suspense } from 'react';
import { api } from 'trpc-api';
import { Greeting } from '~/components/Greeting';

export default async function Home() {
  const [result, result2] = await Promise.all([
    api().greeting.query({ text: 'from server' }),
    api().greeting.query({ text: 'from server2' }),
  ]);

  return (
    <main>
      <Suspense fallback={<>Loading client...</>}>
        <Greeting />
      </Suspense>
      <div>{result}</div>
      <div>{result2}</div>
    </main>
  );
}
