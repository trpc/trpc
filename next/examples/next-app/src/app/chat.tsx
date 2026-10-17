'use client';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTrpc } from '../trpc/client.tsx';

export function Chat() {
  const trpc = useTrpc();
  // Stops the server stream if this component unmounts mid-reply.
  const reply = useMutation(
    trpc.chat.reply.streamedMutationOptions({ abortWhenUnobserved: true }),
  );
  const words = useQuery(trpc.chat.reply.chunksOptions());
  const [text, setText] = useState('');
  return (
    <section>
      <h2>Streamed mutation</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          reply.mutate({ text });
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} />
        <button disabled={reply.isPending}>Send</button>
      </form>
      <p>{(words.data ?? []).join('')}</p>
    </section>
  );
}
