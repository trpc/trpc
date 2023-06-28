'use client';

import { useState } from 'react';
import { testAction } from './_actions';

export function RawExample() {
  const [text, setText] = useState('');

  return (
    <>
      <label>
        Text to send: <br />
        <input
          type="text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
          }}
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
