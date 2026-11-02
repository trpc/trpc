'use client';

import { Button } from '@shared/ui/components/button';
import { Field, FieldLabel } from '@shared/ui/components/field';
import { Input } from '@shared/ui/components/input';
import { Spinner } from '@shared/ui/components/spinner';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { useAction } from 'trpc-api';
import { JsonBlock } from '../_components/json-block';
import { testAction } from './_actions';

export function UseActionExample() {
  const [text, setText] = useState('');
  const testMutation = useAction(testAction, {
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
    <div className="flex flex-col gap-4">
      <Field className="max-w-sm">
        <FieldLabel htmlFor="use-action-text">Text</FieldLabel>
        <Input
          id="use-action-text"
          type="text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
          }}
        />
      </Field>

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={testMutation.status === 'loading'}
          onClick={() => {
            testMutation.mutate({
              text,
            });
          }}
        >
          {testMutation.status === 'loading' && <Spinner />}
          Run server action
        </Button>
        <Button
          variant="outline"
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
            toast('Check the console');
          }}
        >
          Run server action raw debugging
        </Button>
      </div>

      <JsonBlock label="useAction state" value={testMutation} />
    </div>
  );
}
