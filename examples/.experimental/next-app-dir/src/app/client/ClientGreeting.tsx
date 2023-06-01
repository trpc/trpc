'use client';

import { use, useState } from 'react';
import { api } from 'trpc-api';
import { set } from 'zod';

export const ClientGreeting = () => {
  const [_, setNonce] = useState(Math.random());
  const greeting = use(api.greeting.query({ text: 'from client' }));

  return (
    <div>
      <p>{greeting}</p>

      <button
        onClick={async () => {
          const ok = await api.greeting.revalidate({ text: 'from client' });
          console.log(ok);

          // ???: should revalidate have some internal state that triggers rerender automatically?
          setNonce(Math.random());
        }}
      >
        Revalidate client
      </button>
    </div>
  );
};

export const ClientPost = () => {
  const latestPost = use(api.getLatestPost.query());
  const [text, setText] = useState('');

  return (
    <div>
      <p>
        {latestPost.id} - {latestPost.title}
      </p>

      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
      />
      <button
        onClick={async () => {
          const newPost = await api.createPost.mutate({
            title: text,
            content: 'whatever content is hot',
          });
          console.log(newPost);

          await api.getLatestPost.revalidate();
          setText('');
        }}
      >
        Submit
      </button>
    </div>
  );
};
