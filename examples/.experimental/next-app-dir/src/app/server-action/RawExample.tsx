'use client';

import { Button } from '@shared/ui/components/button';
import { Field, FieldLabel } from '@shared/ui/components/field';
import { Input } from '@shared/ui/components/input';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { testAction } from './_actions';

export function RawExample() {
  const [text, setText] = useState('');

  return (
    <div className="flex flex-col gap-4">
      <Field className="max-w-sm">
        <FieldLabel htmlFor="raw-text">Text to send</FieldLabel>
        <Input
          id="raw-text"
          type="text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
          }}
        />
      </Field>
      <Button
        className="self-start"
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
          toast('Check the console');
        }}
      >
        Run server action raw debugging
      </Button>
    </div>
  );
}
