import { createSSGHelpers } from '@trpc/react/ssg';
import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import { inferQueryOutput, trpc, transformer } from '../utils/trpc';
import { appRouter } from './api/trpc/[trpc]';
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
const getLatestTimestamp = (m: Message[]) => {
  return m.reduce((ts, msg) => {
    return maxDate([ts, msg.updatedAt, msg.createdAt]);
  }, new Date(0));
};

export default function Home() {
  const { data, hasPreviousPage, isFetchingPreviousPage, fetchPreviousPage } =
    trpc.useInfiniteQuery(['messages.list', {}], {
      getPreviousPageParam: (d) => d.prevCursor,
    });
  const [msgState, setMessages] = useState(() => [] as Message[]);

  const msgs = useMemo(() => {
    if (msgState.length) {
      return msgState;
    }
    return data ? data.pages.map((p) => p.items).flat() : [];
  }, [msgState, data]);
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

  // ----- merge messages when `query.data` updates
  useEffect(() => {
    if (!data) {
      return;
    }
    const items = data.pages.map((page) => page.items).flat();
    addMessages(items);
  }, [data]);

  // ---- subscriptions
  // latest timestamp
  const timestamp = useMemo(() => getLatestTimestamp(msgs), [msgs]);
  trpc.useSubscription(['messages.newMessages', { timestamp }], {
    enabled: !!data, // only subscribe if data has loaded
    next(newMsgs) {
      addMessages([newMsgs]);
    },
  });

  const addMessage = trpc.useMutation('messages.create');

  return (
    <>
      <Head>
        <title>Chat</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <h1>Chat</h1>

      <h2>Messages</h2>

      <button
        data-testid="loadMore"
        onClick={() => fetchPreviousPage()}
        disabled={!hasPreviousPage || isFetchingPreviousPage}
      >
        {isFetchingPreviousPage
          ? 'Loading more...'
          : hasPreviousPage
          ? 'Load More'
          : 'Nothing more to load'}
      </button>
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
          } catch (cause) {}
        }}
      >
        <input name="text" type="text" />
        <input type="submit" disabled={addMessage.isLoading} />
      </form>

      <div style={{ marginTop: '100px' }}>
        <a
          href="https://vercel.com/?utm_source=trpc&amp;utm_campaign=oss"
          target="_blank"
          rel="noreferrer"
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
