import { Message } from '@prisma/client';
import Head from 'next/head';
import { useEffect, useState } from 'react';
import { dehydrate } from 'react-query/hydration';
import { chatRouter } from './api/trpc/[...trpc]';
import { client, hooks } from './_app';

function maxDate(dates: Date[]) {
  let max = dates[0];

  for (const date of dates) {
    if (date.getTime() > max.getTime()) {
      max = date;
    }
  }

  return max ?? null;
}
const getTimestamp = (m: Message[]) => {
  return m.reduce((ts, msg) => {
    if (msg.updatedAt.getTime() > ts.getTime()) {
      return msg.updatedAt;
    }
    return maxDate([ts, msg.updatedAt, msg.createdAt]);
  }, new Date(0));
};

export default function Home() {
  const qqq = hooks.useQuery(['messages.list']);

  const [msgs, setMessages] = useState(() => qqq.data);
  const addMessages = (newMessages: Message[]) => {
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
      },
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
      revalidate: 1,
    },
  };
}
