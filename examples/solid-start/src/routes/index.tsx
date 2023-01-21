import { Title } from 'solid-start';
import Counter from '~/components/Counter';
import { trpc } from '~/utils/trpc';

export default function Home() {
  // 💡 Tip: CMD+Click (or CTRL+Click) on `greeting` to go to the server definition
  const result = trpc.greeting.useQuery(() => ({ name: 'client' }));

  return (
    <main>
      <Title>Hello World</Title>
      <h1>{result.data?.text ?? 'Loading...'}</h1>
      <Counter />
      <p>
        Visit{' '}
        <a href="https://start.solidjs.com" target="_blank" rel="noreferrer">
          start.solidjs.com
        </a>{' '}
        to learn how to build SolidStart apps.
      </p>
    </main>
  );
}
