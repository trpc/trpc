'use client';

import { useState } from 'react';
import { useAction } from 'trpc-api';
import { testMutation } from './TestMutation_action';

export function TestMutation() {
  const [text, setText] = useState('');
  const mutation = useAction(testMutation);
  mutation.status;
  //       ^?
  return (
    <div className="flex w-full flex-col gap-4 text-center text-xl md:max-w-xl">
      <input
        type={'text'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="bg-slate-300 text-slate-900"
      />
      <button
        onClick={() =>
          mutation.mutate({
            text: 'world',
          })
        }
      >
        Run server action
      </button>

      <button
        onClick={() =>
          testMutation({
            text: 'hello',
          })
        }
      >
        Run server action raw debugging
      </button>

      <pre>{JSON.stringify(mutation, null, 4)}</pre>
    </div>
  );
}
