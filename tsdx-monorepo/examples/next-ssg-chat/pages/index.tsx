import Head from 'next/head';
import { useEffect, useState } from 'react';
import { dehydrate } from 'react-query/hydration';
import { chatRouter } from './api/trpc/[...trpc]';
import { hooks, client } from './_app';

export default function Home() {
  const qqq = hooks.useQuery(['messages/list']);

  const [msgs, setMessages] = useState(() => qqq.data);
  useEffect(() => {
    return client.subscription(['messages/newMessages'], {
      onSuccess(data) {
        console.log('new messages', data);
        setMessages([...msgs, ...data]);
      },
    });
  }, []);

  return (
    <div>
      <Head>
        <title>Chat</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <h1>Chat</h1>

      <h2>Message</h2>
      <ul>
        {msgs.map((m) => (
          <li key={m.id}>
            <pre>{JSON.stringify(m, null, 4)}</pre>
          </li>
        ))}
      </ul>
      <h3>Add message</h3>
    </div>
  );
}
export async function getStaticProps() {
  await hooks.ssr(chatRouter, 'messages/list', {});
  return {
    props: {
      dehydratedState: dehydrate(hooks.queryClient),
    },
  };
}
