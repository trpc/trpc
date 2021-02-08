import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import { inferQueryOutput, trpc } from '../utils/trpc';
import { appRouter } from './api/trpc/[...trpc]';

type MessagesOutput = inferQueryOutput<'messages.list'>;
type Message = MessagesOutput['items'][number];

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
    return maxDate([ts, msg.updatedAt, msg.createdAt]);
  }, new Date(0));
};

export default function Home() {
  const query = trpc.useQuery(['messages.list']);

  const [msgs, setMessages] = useState(() => query.data?.items ?? []);
  const addMessages = (newMessages?: Message[]) => {
    setMessages((nowMessages) => {
      const map: Record<Message['id'], Message> = {};
      for (const msg of nowMessages) {
        map[msg.id] = msg;
      }
      for (const msg of newMessages ?? []) {
        map[msg.id] = msg;
      }
      return Object.values(map).sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
      );
    });
  };
  // get latest timestamp
  const timestamp = useMemo(() => getTimestamp(msgs), [msgs]);

  // merge messages when `query.data` updates
  useEffect(() => addMessages(query.data?.items), [query.data]);

  // ---subscriptions
  const subscription = trpc.useSubscription([
    'messages.newMessages',
    { timestamp },
  ]);

  // merge messages on subscription.data
  useEffect(() => addMessages(subscription.data), [subscription.data]);

  const addMessage = trpc.useMutation('messages.create');

  return (
    <>
      <Head>
        <title>Chat</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <h1>Chat</h1>

      <h2>Messages</h2>
      <ul>
        {msgs.map((m) => (
          <li key={m.id}>
            {m.createdAt.toDateString()} {m.createdAt.toLocaleTimeString()}:{' '}
            {m.text}
          </li>
        ))}
      </ul>
      <h3>Add message</h3>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const $text: HTMLInputElement = (e as any).target.elements.text;
          const input = {
            text: $text.value,
          };

          try {
            const res = await addMessage.mutateAsync(input);
            $text.value = '';
            addMessages([res]);
          } catch (err) {}
        }}
      >
        <input name="text" type="text" />
        <input type="submit" disabled={addMessage.isLoading} />
      </form>

      <div style={{ marginTop: '100px' }}>
        <a
          href="https://vercel.com/?utm_source=trpc&amp;utm_campaign=oss"
          target="_blank"
        >
          <img
            src="/powered-by-vercel.svg"
            alt="Powered by Vercel"
            height="25"
          />
        </a>
      </div>
    </>
  );
}
export async function getStaticProps() {
  await trpc.prefetchQueryOnServer(appRouter, {
    path: 'messages.list',
    input: null,
    ctx: {} as any,
  });
  return {
    props: {
      dehydratedState: trpc.dehydrate(),
    },
    revalidate: 1,
  };
}
