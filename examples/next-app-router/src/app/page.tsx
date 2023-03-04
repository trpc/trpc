import { use } from 'react';
import { api } from 'trpc-api';
import { Greeting } from '~/components/Greeting';

export default function Home() {
  const result = use(api.greeting.query({ text: 'from server' }));
  const result2 = use(api.greeting.query({ text: 'from server2' }));

  return (
    <main>
      <Greeting />
      <div>{result}</div>
      <div>{result2}</div>
    </main>
  );
}
