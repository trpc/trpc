'use client';

import { Button } from '~/components/button';
import { Input } from '~/components/input';
import { JsonPreTag } from '~/components/json-pretag';
import { useState } from 'react';
import { useAction } from 'trpc-api';
import { testAction } from '../_actions';

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
    <div className="space-y-2">
      <label>
        Text
        <br />
        <Input
          type={'text'}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
          }}
        />
      </label>

      <div className="space-x-4">
        <Button
          onClick={() => {
            mutation.mutate({
              text,
            });
          }}
        >
          Run server action
        </Button>
        <Button
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
        </Button>
      </div>
      <JsonPreTag object={mutation} />
    </div>
  );
}
