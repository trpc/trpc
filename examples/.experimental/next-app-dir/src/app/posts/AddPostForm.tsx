'use client';

import { useEffect } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import toast, { Toaster } from 'react-hot-toast';
import { addPost } from './_data';

function SubmitButton(props: Omit<JSX.IntrinsicElements['button'], 'type'>) {
  const state = useFormStatus();

  return (
    <button
      type="submit"
      {...props}
      disabled={state.pending || props.disabled}
    />
  );
}
export function AddPostForm() {
  const [state, action] = useFormState(addPost, {});

  useEffect(() => {
    console.log('Form state', state);
    if (state.error) {
      toast.error(`Failed to add post: ${state.error.code}`);
    }
  }, [state]);

  return (
    <form action={action}>
      <div>
        <input name="title" defaultValue={state.input?.title} />
        {state.error?.fieldErrors?.title && (
          <div>Invalid title: {state.error.fieldErrors.title.join(',')}</div>
        )}
      </div>
      <div>
        <input name="content" defaultValue={state.input?.content} />
        {state.error?.fieldErrors?.content && (
          <div>
            Invalid content: {state.error.fieldErrors.content.join(',')}
          </div>
        )}
      </div>

      {state.error && (
        <div>
          <h3>Errors</h3>
          {state.error?.code === 'UNAUTHORIZED' && (
            <div>Unauthorized - you need to sign in</div>
          )}
          {state.error?.code === 'INPUT_VALIDATION' && <div>Invalid input</div>}
        </div>
      )}
      <SubmitButton>Add post</SubmitButton>
    </form>
  );
}
