'use client';

import { Button } from '~/components/button';
import { Input } from '~/components/input';
import { useState } from 'react';
import { testAction } from '../_actions';

export function RawExample() {
  const [text, setText] = useState('');

  return (
    <div className="space-y-2">
      <label>
        Text to send: <br />
        <Input
          type="text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
          }}
        />
      </label>
      <Button
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
      </Button>
    </div>
  );
}
