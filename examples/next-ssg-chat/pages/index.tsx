import { inferAsyncReturnType, inferSubscriptionData } from '@trpc/server';
import Head from 'next/head';
import { useEffect, useState } from 'react';
import { dehydrate } from 'react-query/hydration';
import { chatRouter } from './api/trpc/[...trpc]';
import { hooks, client } from './_app';
import type { ChatRouter } from './api/trpc/[...trpc]';

type Messages = inferSubscriptionData<
  inferAsyncReturnType<
    ChatRouter['_def']['subscriptions']['messages.newMessages']
  >
>;
type Message = Messages[number];
const getTimestamp = (m: Messages) => {
  return m.reduce((ts, msg) => {
    return Math.max(ts, msg.updatedAt, msg.createdAt);
  }, 0);
};

export default function Home() {
  const qqq = hooks.useQuery(['messages.list']);

  const [msgs, setMessages] = useState(() => qqq.data);
  const addMessages = (newMessages: Messages) => {
    setMessages((nowMessages) => {
      const map: Record<Message['id'], Message> = {};
      for (const msg of nowMessages) {
        map[msg.id] = msg;
      }
      for (const msg of newMessages) {
        map[msg.id] = msg;
      }
      return Object.values(map);
    });
  };
  useEffect(() => {
    return client.subscription(
      [
        'messages.newMessages',
        {
          timestamp: getTimestamp(msgs),
        },
      ],
      {
        onSuccess(data) {
          addMessages(data);
        },
        getNextArgs(data) {
          return [
            {
              timestamp: getTimestamp(data),
            },
          ];
        },
      }
    );
  }, []);
  let m = hooks.useMutation('messages.create');
  // useEffect(() => {
  //   let timer = setInterval(() => {
  //     m.mutate(['some msg' + Math.random()]);
  //   }, 5000);
  //   return () => {
  //     clearTimeout(timer);
  //   };
  // }, []);

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

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const $text: HTMLInputElement = (e as any).target.elements.text;
          const data = {
            text: $text.value,
          };

          try {
            const res = await m.mutateAsync([data.text]);
            $text.value = '';
            addMessages([res]);
          } catch (err) {}
        }}
      >
        <input name="text" type="text" />
        <input type="submit" disabled={m.isLoading} />
      </form>
    </div>
  );
}
export async function getStaticProps() {
  await hooks.ssr(chatRouter, 'messages.list', {});
  return {
    props: {
      dehydratedState: dehydrate(hooks.queryClient),
    },
  };
}
