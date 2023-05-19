'use client';

import { useState } from 'react';
import { useAction } from 'trpc-api';
import { testAction } from './_actions';

export function RawTestMutation() {
  const [text, setText] = useState('');
  const mutation = useAction(testAction);
  //     ^?
  mutation.status;
  mutation.data;
  //        ^?
  mutation.error;
  //       ^?
  return (
    <>
      <label>
        Text to send: <br />
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <br />
      <button
        onClick={async () => {
          const res = await testAction({
            text,
          });
          console.log('result', res);
          //          ^?
          if ('result' in res) {
            res.result;
            res.result.data;
            //           ^?
          } else {
            res.error;
            //   ^?
          }
          alert('Check console');
        }}
      >
        Run server action raw debugging
      </button>
    </>
  );
}
