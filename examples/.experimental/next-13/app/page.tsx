import { trpc } from 'trpc';
import { ClientComponent } from './ClientComponent';

export default async function Home() {
  const data = await trpc.hello.query();
  return (
    <>
      <p>RSC data: {data}</p>

      <ClientComponent />
    </>
  );
}
