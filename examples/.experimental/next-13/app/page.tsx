import { trpc } from 'trpc';
import { ClientComponent } from './ClientComponent';

export default async function Home() {
  const data = await trpc.hello.query({
    name: 'world',
  });
  return (
    <>
      <p>RSC data: {data.rsc ? 'RSC!' : 'CLIENT'}</p>

      <ClientComponent />
    </>
  );
}
