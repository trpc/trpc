'use client';

import { useState } from 'react';
import { simpleAddPost } from './_data';
import { SubmitButton } from './AddPostForm_useFormState';

export function AddPostForm_invoked() {
  const [state, setState] =
    useState<Awaited<ReturnType<typeof simpleAddPost> | null>>(null);

  return (
    <form
      action={async (data) => {
        const res = await simpleAddPost(data);
        setState(res);
      }}
    >
      <div>
        <input name="title" defaultValue={state?.input?.title} />
        {state?.error?.fieldErrors?.title && (
          <div>Invalid title: {state?.error.fieldErrors.title.join(',')}</div>
        )}
      </div>
      <div>
        <input name="content" defaultValue={state?.input?.content} />
        {state?.error?.fieldErrors?.content && (
          <div>
            Invalid content: {state?.error.fieldErrors.content.join(',')}
          </div>
        )}
      </div>

      {state?.error && (
        <div>
          <h3>Errors</h3>
          {state?.error?.code === 'UNAUTHORIZED' && (
            <div>Unauthorized - you need to sign in</div>
          )}
          {state?.error?.code === 'INPUT_VALIDATION' && (
            <div>Invalid input</div>
          )}
        </div>
      )}
      <SubmitButton>Add post</SubmitButton>
    </form>
  );
}
