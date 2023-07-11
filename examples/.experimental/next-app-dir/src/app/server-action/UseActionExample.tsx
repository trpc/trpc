'use client';

import { useState } from 'react';
import { useAction } from 'trpc-api';
import { testAction } from './_actions';

export function UseActionExample() {
  const [text, setText] = useState('');
  const mutation = useAction(testAction, {
    onSuccess(data) {
      data;
      // ^?
    },
    onError(error) {
      error;
      // ^?
    },
  });

  return (
    <>
      <p>
        <label>
          Text
          <br />
          <input
            type={'text'}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
            }}
            className="bg-slate-300 text-slate-900"
          />
        </label>
      </p>

      <p>
        <button
          onClick={() => {
            mutation.mutate({
              text,
            });
          }}
        >
          Run server action
        </button>
      </p>
      <p>
        <button
          onClick={async () => {
            const res = await testAction({
              text: '',
            });
            console.log(res);
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
      </p>
      <pre
        style={{
          overflowX: 'scroll',
        }}
      >
        {JSON.stringify(mutation, null, 4)}
      </pre>
    </>
  );
}
